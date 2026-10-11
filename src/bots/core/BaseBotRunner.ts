import type {
  IBotRunner,
  BotContext,
  BotRunResult,
  PhaseDefinition,
  PhaseResult,
  BotErrorRecord,
  StepResult,
  ScreenshotResult,
  DomSnapshotResult,
} from './types';
import { PhaseStateMachine } from './PhaseStateMachine';
import { sleep, calculateBackoff } from '../browser';
import { SimulationSuspend } from '../../workers/simulation/types';
import { isFatalErrorMessage } from './fatalErrors';

export abstract class BaseBotRunner implements IBotRunner {
  abstract readonly botType: string;
  abstract readonly phases: PhaseDefinition[];
  // Default true; los runners sin browser (FTP, IMAP) lo sobreescriben a false.
  readonly requiresBrowser: boolean = true;
  readonly notifyClientOnFailure: boolean = true;

  protected context!: BotContext;
  protected stateMachine!: PhaseStateMachine;
  protected aborted: boolean = false;
  protected paused: boolean = false;

  async initialize(context: BotContext): Promise<void> {
    this.context = context;
    this.stateMachine = new PhaseStateMachine(this.phases, context);
    this.aborted = false;
    this.paused = false;

    // Hook for custom initialization
    await this.onInitialize();
  }

  async run(): Promise<BotRunResult> {
    const startTime = Date.now();

    await this.context.tracking.updateBotRun(this.context.botRunId, {
      status: 'running',
      startedAt: new Date(),
    });

    try {
      // Execute phases sequentially
      while (this.stateMachine.hasNextPhase() && !this.aborted) {
        // Check if paused
        while (this.paused && !this.aborted) {
          await sleep(1000);
        }

        if (this.aborted) break;

        // Check for external cancellation request before each phase
        const cancelled = await this.context.tracking.isCancellationRequested(this.context.botRunId);
        if (cancelled) {
          this.context.logger.info('External cancellation detected');
          await this.abort('Cancelled by user request');
          break;
        }

        const phase = this.stateMachine.getCurrentPhase();
        if (!phase) break;

        const phaseResult = await this.executePhase(phase);

        // Check if requires human intervention
        if (phaseResult.error?.requiresHumanIntervention) {
          return this.buildResult('requires_intervention', startTime, phaseResult.error);
        }

        // If phase failed and is required, stop
        if (phaseResult.status === 'failed' && phase.required) {
          return this.buildResult('failed', startTime, phaseResult.error);
        }

        this.stateMachine.moveToNextPhase();
      }

      if (this.aborted) {
        return this.buildResult('failed', startTime, {
          errorType: 'aborted',
          severity: 'info',
          message: 'Bot execution was aborted',
          context: {},
          recoverable: false,
          requiresHumanIntervention: false,
          timestamp: new Date(),
        });
      }

      return this.buildResult('completed', startTime);
    } catch (error) {
      // SimulationSuspend no es un fallo: propagarlo para que el worker suspenda el job.
      if (error instanceof SimulationSuspend) throw error;
      const err = error as Error;
      this.context.logger.error({ error: err }, 'Unhandled error in bot execution');

      return this.buildResult('failed', startTime, {
        errorType: 'unhandled',
        severity: 'critical',
        message: err.message,
        stackTrace: err.stack,
        context: {},
        recoverable: false,
        requiresHumanIntervention: true,
        timestamp: new Date(),
      });
    }
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.context.logger.info('Bot execution paused');

    await this.context.tracking.updateBotRun(this.context.botRunId, {
      status: 'paused',
    });
  }

  async resume(): Promise<void> {
    this.paused = false;
    this.context.logger.info('Bot execution resumed');

    await this.context.tracking.updateBotRun(this.context.botRunId, {
      status: 'running',
    });
  }

  async abort(reason: string): Promise<void> {
    this.aborted = true;
    this.context.logger.info({ reason }, 'Bot execution aborted');

    // Close browser page immediately to stop any ongoing operations
    if (this.context.page) {
      try {
        await this.context.page.close();
        this.context.logger.debug('Browser page closed during abort');
      } catch (e) {
        this.context.logger.warn({ error: e }, 'Failed to close browser page during abort');
      }
    }
  }

  async cleanup(): Promise<void> {
    await this.onCleanup();
  }

  // ============================================================================
  // PHASE EXECUTION
  // ============================================================================

  private async executePhase(phase: PhaseDefinition): Promise<PhaseResult> {
    this.context.logger.info({ phaseId: phase.id, phaseName: phase.name }, 'Starting phase');

    this.stateMachine.markPhaseStarted(phase.id);
    const startTime = Date.now();

    // Create phase record in DB
    const phaseRecord = await this.context.tracking.createBotPhase({
      botRunId: this.context.botRunId,
      phaseNumber: phase.order,
      phaseId: phase.id,
      phaseName: phase.name,
      status: 'running',
      stepsTotal: phase.steps.length,
      stepsCompleted: 0,
    });

    // Set current phase for step tracking and screenshot storage
    this.context.tracking.setCurrentPhaseId(phaseRecord.id);
    this.context.storage.setCurrentPhaseId(phaseRecord.id);

    // Update BotRun with current phase
    await this.context.tracking.updateBotRun(this.context.botRunId, {
      currentPhase: phase.name,
    });

    try {
      // Pre-validation if defined
      if (phase.validate) {
        const input = this.getPhaseInput(phase);
        const isValid = await phase.validate(this.context, input);
        if (!isValid) {
          throw new Error(`Phase ${phase.id} validation failed`);
        }
      }

      // Hook before phase
      await this.onBeforePhase(phase);

      // Execute phase
      const input = this.getPhaseInput(phase);
      const result = await phase.execute(this.context, input);

      const duration = Date.now() - startTime;

      // Capture an appropriate screenshot based on phase outcome:
      //   - success  → milestone screenshot (phase_X_complete)
      //   - failed   → error screenshot + DOM snapshot (phase_X_error), unless phase already captured them
      let milestoneScreenshot: ScreenshotResult | undefined;
      let errorScreenshot: ScreenshotResult | undefined;
      let errorDomSnapshot: DomSnapshotResult | undefined;

      if (result.status === 'success') {
        if (this.context.config.screenshotOnMilestone && this.context.page) {
          try {
            milestoneScreenshot = await this.context.storage.saveScreenshot(
              this.context.page,
              `phase_${phase.id}_complete`,
              'milestone',
              phaseRecord.id
            );
          } catch (e) {
            this.context.logger.warn({ error: e }, 'Failed to capture milestone screenshot');
          }
        }
      } else if (this.context.config.screenshotOnError && this.context.page) {
        // Phase failed — capture error screenshot and DOM snapshot.
        //
        // IMPORTANT: we only skip our own capture when the phase already provided a
        // FULL `ScreenshotResult` / `DomSnapshotResult` object. We intentionally do
        // NOT skip when the phase only set the deprecated `screenshotPath` / `domSnapshotPath`
        // string fields: those bare keys can't populate the file metadata columns
        // (`screenshot_server_data`, `screenshot_data`) on the BotError row, which
        // makes the resulting record look like "screenshot saved" but fail to
        // download from the client. See BotTrackingService.createBotError for the
        // preferred vs legacy write paths.
        if (!result.error?.screenshot) {
          try {
            errorScreenshot = await this.context.storage.saveScreenshot(
              this.context.page,
              `phase_${phase.id}_error`,
              'error',
              phaseRecord.id
            );
          } catch (e) {
            this.context.logger.warn({ error: e }, 'Failed to capture phase error screenshot');
          }
        }
        if (!result.error?.domSnapshot) {
          try {
            errorDomSnapshot = await this.context.storage.saveDomSnapshot(
              this.context.page,
              `phase_${phase.id}_error`
            );
          } catch (e) {
            this.context.logger.warn({ error: e }, 'Failed to capture phase error DOM snapshot');
          }
        }
      }

      const phaseScreenshot = result.status === 'success' ? milestoneScreenshot : errorScreenshot;

      // Update phase record
      await this.context.tracking.updateBotPhase(phaseRecord.id, {
        status: result.status,
        stepsCompleted: result.stepsCompleted,
        stepsTotal: result.stepsTotal,
        completedAt: new Date(),
        duration,
        ...(result.error && { error: result.error as unknown as Record<string, unknown> }),
        ...(phaseScreenshot && { screenshot: phaseScreenshot }),
      });

      // Update stats
      if (result.status === 'success') {
        this.stateMachine.markPhaseCompleted(phase.id, result.stepsCompleted);
        await this.context.tracking.updateBotRun(this.context.botRunId, {
          completedPhases: this.stateMachine.getCompletedCount(),
        });
      } else {
        // Phase returned failed status — persist the error as a BotError entity so it
        // shows up in BotRun.errors / BotPhase.errors. Without this, a failed-return
        // phase leaves no BotError record, only the JSON blob in BotPhase.error.
        //
        // Prefer full ScreenshotResult / DomSnapshotResult (populates all 3 DB file columns)
        // over bare path strings. Fall back to strings for backwards compatibility.
        if (result.error) {
          try {
            // Prefer the phase's own full ScreenshotResult/DomSnapshotResult (so the
            // capture reflects the exact moment of failure, not after the phase
            // unwinding). Fall back to the screenshot we re-captured above when the
            // phase only provided deprecated path strings or nothing at all. We no
            // longer pass `screenshotId`/`domSnapshotId` because bare key strings
            // can't populate the `_server_data` / `_data` metadata columns and
            // produce BotError rows with a file reference the client can't download.
            await this.context.tracking.createBotError({
              botRunId: this.context.botRunId,
              botPhaseId: phaseRecord.id,
              errorType: result.error.errorType,
              severity: result.error.severity,
              message: result.error.message,
              stackTrace: result.error.stackTrace,
              context: result.error.context,
              recoverable: result.error.recoverable,
              requiresHumanIntervention: result.error.requiresHumanIntervention,
              screenshot: result.error.screenshot ?? errorScreenshot,
              domSnapshot: result.error.domSnapshot ?? errorDomSnapshot,
            });
          } catch (e) {
            this.context.logger.warn({ error: e, phaseId: phase.id }, 'Failed to create BotError entity');
          }
        }

        // Fail any steps that were still running when phase returned error
        await this.context.tracking.failPendingSteps(phaseRecord.id, {
          errorType: 'phase_returned_error',
          message: result.error?.message || 'Phase returned non-success status',
          inheritedFromPhase: true,
          timestamp: new Date().toISOString(),
        });
        this.stateMachine.markPhaseFailed(phase.id, new Error(result.error?.message || 'Unknown error'));
      }

      // Hook after phase
      await this.onAfterPhase(phase, result);

      // Store phase output
      if (result.output) {
        this.context.state.phaseOutputs[phase.id] = result.output;
      }

      this.context.logger.info(
        { phaseId: phase.id, status: result.status, duration },
        'Phase completed'
      );

      return {
        ...result,
        screenshotPath: result.screenshotPath ?? phaseScreenshot?.key,
      };
    } catch (error) {
      // SimulationSuspend no es un fallo: propagarlo para que el worker suspenda el job.
      if (error instanceof SimulationSuspend) throw error;
      const err = error as Error;
      const duration = Date.now() - startTime;

      this.context.logger.error({ phaseId: phase.id, error: err }, 'Phase failed');

      // Capture error screenshot and DOM snapshot
      let errorScreenshot: ScreenshotResult | undefined;
      let errorDomSnapshot: DomSnapshotResult | undefined;
      if (this.context.config.screenshotOnError && this.context.page) {
        try {
          errorScreenshot = await this.context.storage.saveScreenshot(
            this.context.page,
            `phase_${phase.id}_error`,
            'error',
            phaseRecord.id
          );
        } catch (e) {
          this.context.logger.warn({ error: e }, 'Failed to capture error screenshot');
        }
        try {
          errorDomSnapshot = await this.context.storage.saveDomSnapshot(
            this.context.page,
            `phase_${phase.id}_error`
          );
        } catch (e) {
          this.context.logger.warn({ error: e }, 'Failed to capture error DOM snapshot');
        }
      }

      // Modelo deny-list (fatalErrors.ts): el default es REINTENTAR — los portales
      // tiran errores transitorios (timeouts, container-not-found, elemento no
      // accionable) que se arreglan reintentando. Solo la deny-list explícita
      // (auth/credenciales/404) corta los reintentos → dead_letter → humano.
      // Antes esto estaba hardcodeado en `false`, anulando el modelo y dejando que
      // cualquier hipo del portal matara la corrida sin reintentar.
      const fatal = isFatalErrorMessage(err.message);

      const errorRecord: BotErrorRecord = {
        errorType: 'phase_execution',
        severity: 'critical',
        message: err.message,
        stackTrace: err.stack,
        context: { phaseId: phase.id },
        recoverable: !fatal,
        requiresHumanIntervention: phase.required && fatal,
        phaseId: phase.id,
        screenshot: errorScreenshot,
        domSnapshot: errorDomSnapshot,
        timestamp: new Date(),
      };

      // Create error record — pass full ScreenshotResult/DomSnapshotResult so all
      // 3 file metadata columns (screenshot, screenshot_server_data, screenshot_data)
      // are populated on the BotError row.
      await this.context.tracking.createBotError({
        botRunId: this.context.botRunId,
        botPhaseId: phaseRecord.id,
        errorType: errorRecord.errorType,
        severity: errorRecord.severity,
        message: errorRecord.message,
        stackTrace: errorRecord.stackTrace,
        context: errorRecord.context,
        recoverable: errorRecord.recoverable,
        requiresHumanIntervention: errorRecord.requiresHumanIntervention,
        screenshot: errorScreenshot,
        domSnapshot: errorDomSnapshot,
      });

      // Update phase record
      await this.context.tracking.updateBotPhase(phaseRecord.id, {
        status: 'failed',
        completedAt: new Date(),
        duration,
        error: errorRecord as unknown as Record<string, unknown>,
        ...(errorScreenshot && { screenshot: errorScreenshot }),
      });

      // Fail any steps that were still running
      await this.context.tracking.failPendingSteps(phaseRecord.id, {
        errorType: 'phase_failed',
        message: err.message,
        inheritedFromPhase: true,
        timestamp: new Date().toISOString(),
      });

      this.stateMachine.markPhaseFailed(phase.id, err);

      // Hook on error
      await this.onPhaseError(phase, err);

      return {
        status: 'failed',
        stepsCompleted: 0,
        stepsTotal: phase.steps.length,
        error: errorRecord,
        screenshotPath: errorScreenshot?.key,
      };
    }
  }

  // ============================================================================
  // STEP EXECUTION WITH RETRIES
  // ============================================================================

  protected async executeStepWithRetries<TInput, TOutput>(
    step: { id: string; name: string; retryable: boolean; maxRetries?: number },
    execute: () => Promise<StepResult<TOutput>>
  ): Promise<StepResult<TOutput>> {
    const maxRetries = step.retryable
      ? (step.maxRetries ?? this.context.config.defaultRetries)
      : 0;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = calculateBackoff(
            attempt,
            this.context.config.retryDelay,
            this.context.config.retryBackoffMultiplier
          );
          this.context.logger.info(
            { stepId: step.id, attempt, maxRetries, delay },
            `Retrying step`
          );
          await sleep(delay);
        }

        const startTime = Date.now();
        const result = await execute();

        result.metrics = {
          ...result.metrics,
          duration: Date.now() - startTime,
          retryCount: attempt,
        };

        return result;
      } catch (error) {
        lastError = error as Error;
        this.context.logger.warn(
          { stepId: step.id, attempt, error: lastError.message },
          'Step attempt failed'
        );
      }
    }

    return {
      status: 'failed',
      error: {
        message: lastError?.message || 'Unknown error',
        recoverable: false,
        requiresHumanIntervention: true,
      },
      metrics: {
        duration: 0,
        retryCount: maxRetries,
      },
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getPhaseInput(phase: PhaseDefinition): unknown {
    // Get output from previous phase or use params
    const previousPhase = this.phases.find((p) => p.order === phase.order - 1);
    if (previousPhase) {
      return this.context.state.phaseOutputs[previousPhase.id];
    }
    return this.context.params;
  }

  private buildResult(
    status: 'completed' | 'failed' | 'requires_intervention',
    startTime: number,
    error?: BotErrorRecord
  ): BotRunResult {
    const completedAt = new Date();
    const duration = Date.now() - startTime;

    const result: BotRunResult = {
      status,
      botRunId: this.context.botRunId,
      startedAt: new Date(startTime),
      completedAt,
      totalPhases: this.stateMachine.getTotalCount(),
      completedPhases: this.stateMachine.getCompletedCount(),
      failedPhases: this.stateMachine.getFailedCount(),
      duration,
      requiresHumanIntervention: status === 'requires_intervention',
      ...(error && { error }),
      ...(error?.message && status === 'requires_intervention' && {
        interventionReason: error.message,
      }),
    };

    // Propagar el resultado específico del bot. Los runners pueden exponer un
    // getResult() con datos propios (ej. el tramiteNumber del registro DNDA, que el
    // stage persiste en SignedEdition para luego matchear el email de habilitación).
    // Sin esto, ese result se perdía en el borde runner→orquestador y quedaba NULL.
    try {
      const runnerResult = (this as unknown as {
        getResult?: () => Record<string, unknown> | undefined;
      }).getResult?.();
      if (runnerResult) {
        result.result = runnerResult;
      }
    } catch {
      // Un getResult() defectuoso del runner NO debe tumbar la corrida entera
      // (perderíamos el status real). El result específico se omite y listo.
    }

    return result;
  }

  // ============================================================================
  // HOOKS (override in subclasses)
  // ============================================================================

  protected async onInitialize(): Promise<void> {}
  protected async onBeforePhase(_phase: PhaseDefinition): Promise<void> {}
  protected async onAfterPhase(_phase: PhaseDefinition, _result: PhaseResult): Promise<void> {}
  protected async onPhaseError(_phase: PhaseDefinition, _error: Error): Promise<void> {}
  protected async onCleanup(): Promise<void> {}
}
