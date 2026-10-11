import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type {
  IBotTrackingService,
  CreateBotRunData,
  UpdateBotRunData,
  CreateBotPhaseData,
  UpdateBotPhaseData,
  CreateBotErrorData,
  CompleteStepOptions,
} from '../core/types';

export class BotTrackingService implements IBotTrackingService {
  private currentPhaseId: string | null = null;
  private stepCounter: number = 0;
  private stepStartTimes: Map<string, Date> = new Map();

  constructor(
    private prisma: PrismaClient,
    private tenantId: string,
    private userId: string,
    private logger: Logger
  ) {}

  setCurrentPhaseId(phaseId: string | null): void {
    this.currentPhaseId = phaseId;
    this.stepCounter = 0;
  }

  async createBotRun(data: CreateBotRunData): Promise<{ id: string }> {
    this.logger.debug({ data }, 'Creating BotRun');

    // Get next runNumber for this tenant
    const lastRun = await this.prisma.botRun.findFirst({
      where: { tenant_id_: this.tenantId },
      orderBy: { runNumber: 'desc' },
      select: { runNumber: true },
    });
    const runNumber = (lastRun?.runNumber ?? 0) + 1;

    const now = new Date();
    const botRun = await this.prisma.botRun.create({
      data: {
        version_: '0',
        createdAt_: now,
        createdBy_: { connect: { id: this.userId } },
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: this.userId } },
        tenant_: { connect: { id: this.tenantId } },
        botType: data.botType,
        runNumber,
        status: data.status,
        correlationId: data.correlationId,
        params: data.params,
        totalPhases: data.totalPhases,
        completedPhases: 0,
        requiresHumanIntervention: false,
        triggeredBy: { connect: { id: data.triggeredById } },
        startedAt: data.startedAt || now,
        ...(data.workerEventId && {
          workerEvent: { connect: { id: data.workerEventId } },
        }),
        ...(data.relatedEntityType && { relatedEntityType: data.relatedEntityType }),
        ...(data.relatedEntityId && { relatedEntityId: data.relatedEntityId }),
        ...(data.relatedEntityLabel && { relatedEntityLabel: data.relatedEntityLabel }),
      },
    });

    this.logger.info({ botRunId: botRun.id }, 'BotRun created');
    return { id: botRun.id };
  }

  async updateBotRun(id: string, data: UpdateBotRunData): Promise<void> {
    this.logger.debug({ id, data }, 'Updating BotRun');

    try {
      await this.prisma.botRun.update({
        where: { id },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.currentPhase !== undefined && { currentPhase: data.currentPhase }),
          ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
          ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
          ...(data.duration !== undefined && { duration: data.duration }),
          ...(data.result !== undefined && { result: data.result }),
          ...(data.error !== undefined && { error: data.error }),
          ...(data.completedPhases !== undefined && { completedPhases: data.completedPhases }),
          ...(data.requiresHumanIntervention !== undefined && {
            requiresHumanIntervention: data.requiresHumanIntervention,
          }),
          ...(data.interventionReason !== undefined && {
            interventionReason: data.interventionReason,
          }),
          ...(data.logsPath !== undefined && { logsPath: data.logsPath }),
        },
      });

      this.logger.debug({ id }, 'BotRun updated');
    } catch (error) {
      this.logger.error({ id, error, data }, 'Failed to update BotRun');
      throw error;
    }
  }

  async createBotPhase(data: CreateBotPhaseData): Promise<{ id: string }> {
    this.logger.debug({ data }, 'Creating BotPhase');

    const now = new Date();
    const botPhase = await this.prisma.botPhase.create({
      data: {
        version_: '0',
        createdAt_: now,
        createdBy_: { connect: { id: this.userId } },
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: this.userId } },
        tenant_: { connect: { id: this.tenantId } },
        parent_BotRun_phases: { connect: { id: data.botRunId } },
        phaseNumber: data.phaseNumber,
        phaseId: data.phaseId,
        phaseName: data.phaseName,
        status: data.status,
        stepsTotal: data.stepsTotal,
        stepsCompleted: data.stepsCompleted,
      },
    });

    this.logger.debug({ botPhaseId: botPhase.id }, 'BotPhase created');
    return { id: botPhase.id };
  }

  async updateBotPhase(id: string, data: UpdateBotPhaseData): Promise<void> {
    this.logger.debug({ id, data }, 'Updating BotPhase');

    await this.prisma.botPhase.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.stepsCompleted !== undefined && { stepsCompleted: data.stepsCompleted }),
        ...(data.stepsTotal !== undefined && { stepsTotal: data.stepsTotal }),
        ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
        ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(data.error !== undefined && { error: data.error }),
        ...(data.stepsLogPath !== undefined && { stepsLogPath: data.stepsLogPath }),
        ...(data.screenshot !== undefined && {
          screenshot: data.screenshot.filename,
          screenshot_server_data: data.screenshot.serverData,
          screenshot_data: data.screenshot.clientData,
        }),
      },
    });

    this.logger.debug({ id }, 'BotPhase updated');
  }

  async createBotError(data: CreateBotErrorData): Promise<{ id: string }> {
    this.logger.debug({ data }, 'Creating BotError');

    const now = new Date();
    const botError = await this.prisma.botError.create({
      data: {
        version_: '0',
        createdAt_: now,
        createdBy_: { connect: { id: this.userId } },
        lastUpdatedAt_: now,
        lastUpdatedBy_: { connect: { id: this.userId } },
        tenant_: { connect: { id: this.tenantId } },
        parent_BotRun_errors: { connect: { id: data.botRunId } },
        errorType: data.errorType,
        severity: data.severity,
        message: data.message,
        ...(data.stackTrace && { stackTrace: data.stackTrace }),
        context: data.context,
        recoverable: data.recoverable,
        requiresHumanIntervention: data.requiresHumanIntervention,
        // Preferred path: full ScreenshotResult populates all 3 file columns
        ...(data.screenshot && {
          screenshot: data.screenshot.filename,
          screenshot_server_data: data.screenshot.serverData,
          screenshot_data: data.screenshot.clientData,
        }),
        // Legacy: string-only screenshotId sets just the `screenshot` column
        ...(!data.screenshot && data.screenshotId && { screenshot: data.screenshotId }),
        // Preferred path: full DomSnapshotResult populates all 3 DOM snapshot columns
        ...(data.domSnapshot && {
          domSnapshot: data.domSnapshot.filename,
          domSnapshot_server_data: data.domSnapshot.serverData,
          domSnapshot_data: data.domSnapshot.clientData,
        }),
        // Legacy: string-only domSnapshotId sets just the `domSnapshot` column
        ...(!data.domSnapshot && data.domSnapshotId && { domSnapshot: data.domSnapshotId }),
      },
    });

    this.logger.info(
      { botErrorId: botError.id, errorType: data.errorType, severity: data.severity },
      'BotError created'
    );
    return { id: botError.id };
  }

  // ============================================================================
  // STEP TRACKING
  // ============================================================================

  async startStep(stepId: string): Promise<{ id: string } | null> {
    if (!this.currentPhaseId) {
      this.logger.warn({ stepId }, 'startStep called without currentPhaseId set');
      return null;
    }

    this.stepCounter++;
    this.stepStartTimes.set(stepId, new Date());

    this.logger.debug({ stepId, stepNumber: this.stepCounter, phaseId: this.currentPhaseId }, 'Starting step');

    const now = new Date();
    try {
      const step = await this.prisma.botStep.create({
        data: {
          version_: '0',
          createdAt_: now,
          createdBy_: { connect: { id: this.userId } },
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: this.userId } },
          tenant_: { connect: { id: this.tenantId } },
          parent_BotPhase_steps: { connect: { id: this.currentPhaseId } },
          stepNumber: this.stepCounter,
          stepId,
          status: 'running',
          startedAt: now,
        },
      });
      return { id: step.id };
    } catch (error) {
      this.logger.error({ stepId, error }, 'Failed to create BotStep');
      return null;
    }
  }

  async completeStep(stepId: string, options?: CompleteStepOptions): Promise<void> {
    if (!this.currentPhaseId) {
      this.logger.warn({ stepId }, 'completeStep called without currentPhaseId set');
      return;
    }

    const { error, downloadedFile } = options || {};
    const startTime = this.stepStartTimes.get(stepId);
    const now = new Date();
    const duration = startTime ? now.getTime() - startTime.getTime() : undefined;

    this.logger.debug({ stepId, duration, error, hasDownloadedFile: !!downloadedFile, phaseId: this.currentPhaseId }, 'Completing step');

    try {
      // Find the step by phaseId and stepId
      const step = await this.prisma.botStep.findFirst({
        where: {
          BotPhase_steps_id: this.currentPhaseId,
          stepId,
          status: 'running',
        },
        select: { id: true },
      });

      if (step) {
        await this.prisma.botStep.update({
          where: { id: step.id },
          data: {
            status: error ? 'failed' : 'success',
            completedAt: now,
            duration,
            ...(error && { error }),
            ...(downloadedFile && {
              downloadedFile: downloadedFile.filename,
              downloadedFile_server_data: downloadedFile.serverData,
              downloadedFile_data: downloadedFile.clientData,
            }),
          },
        });
      }

      this.stepStartTimes.delete(stepId);
    } catch (err) {
      this.logger.error({ stepId, error: err }, 'Failed to update BotStep');
    }
  }

  async failPendingSteps(phaseId: string, error: Record<string, unknown>): Promise<void> {
    this.logger.debug({ phaseId }, 'Failing pending steps for phase');

    const now = new Date();
    try {
      const result = await this.prisma.botStep.updateMany({
        where: {
          BotPhase_steps_id: phaseId,
          status: 'running',
        },
        data: {
          status: 'failed',
          completedAt: now,
          error,
        },
      });

      if (result.count > 0) {
        this.logger.info({ phaseId, count: result.count }, 'Failed pending steps');
      }

      this.stepStartTimes.clear();
    } catch (err) {
      this.logger.error({ phaseId, error: err }, 'Failed to fail pending steps');
    }
  }

  // ============================================================================
  // CANCELLATION SUPPORT
  // ============================================================================

  async isCancellationRequested(botRunId: string): Promise<boolean> {
    const botRun = await this.prisma.botRun.findUnique({
      where: { id: botRunId },
      select: { cancellationRequestedAt: true },
    });
    return botRun?.cancellationRequestedAt !== null && botRun?.cancellationRequestedAt !== undefined;
  }

  async requestCancellation(
    botRunId: string,
    reason: string,
    requestedById: string
  ): Promise<void> {
    this.logger.info({ botRunId, reason, requestedById }, 'Requesting bot cancellation');

    try {
      await this.prisma.botRun.update({
        where: { id: botRunId },
        data: {
          cancellationRequestedAt: new Date(),
          cancellationRequestedBy: { connect: { id: requestedById } },
          cancellationReason: reason,
        },
      });
      this.logger.info({ botRunId }, 'Cancellation request recorded');
    } catch (error) {
      this.logger.error({ botRunId, error }, 'Failed to request cancellation');
      throw error;
    }
  }

  async findRunningBotByRelatedEntity(
    relatedEntityId: string,
    relatedEntityType: string,
    tenantId: string
  ): Promise<{ id: string } | null> {
    this.logger.debug({ relatedEntityId, relatedEntityType, tenantId }, 'Finding running bot by related entity');

    const botRun = await this.prisma.botRun.findFirst({
      where: {
        relatedEntityId,
        relatedEntityType,
        tenant_id_: tenantId,
        status: { in: ['pending', 'running', 'paused'] },
      },
      select: { id: true },
      orderBy: { createdAt_: 'desc' },
    });

    if (botRun) {
      this.logger.debug({ botRunId: botRun.id }, 'Found running bot');
    } else {
      this.logger.debug('No running bot found');
    }

    return botRun;
  }
}
