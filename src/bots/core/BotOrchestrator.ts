import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type {
  IBotRunner,
  BotContext,
  BotRunResult,
  BotConfig,
  BotExecutionParams,
  UserCredentials,
  DEFAULT_BOT_CONFIG,
} from './types';
import type { MyApolloContext } from '../../context';
import type { ISatelliteRegistry, ProxyInfo } from '../../satellite/types';
import { BotStorageService } from '../services/BotStorageService';
import { BotTrackingService } from '../services/BotTrackingService';
import { BotNotificationService } from '../services/BotNotificationService';
import { BrowserManager } from '../browser/BrowserManager';
import { ProxyPool } from '../../satellite/services/ProxyPool';
import { getBotRunner } from '../registry';
import { v4 as uuidv4 } from 'uuid';
import { SimulationSuspend } from '../../workers/simulation/types';
import { RecoverableBotError } from './types';

/**
 * Detect current region by checking public IP geolocation.
 * Uses ipinfo.io which returns country code in lowercase.
 * Returns null if detection fails (network error, etc.)
 */
async function detectCurrentRegion(logger: Logger): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://ipinfo.io/json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Failed to detect region from ipinfo.io');
      return null;
    }

    const data = await response.json() as { country?: string };
    const country = data.country?.toLowerCase() || null;

    logger.info({ detectedCountry: country }, `Current region detected: ${country}`);
    return country;
  } catch (error) {
    logger.warn({ error }, 'Failed to detect current region');
    return null;
  }
}

export interface OrchestratorDependencies {
  prisma: PrismaClient;
  apolloContext: MyApolloContext;
  logger: Logger;
  tenantId: string;
  userId: string;
  satelliteRegistry?: ISatelliteRegistry;
}

/**
 * Base Bot Orchestrator - Generic framework for running bots.
 * Projects should extend this class and override validateUserCredentials()
 * to implement project-specific credential validation.
 */
export class BotOrchestrator {
  protected prisma: PrismaClient;
  protected apolloContext: MyApolloContext;
  protected logger: Logger;
  protected tenantId: string;
  protected userId: string;
  protected satelliteRegistry?: ISatelliteRegistry;

  constructor(deps: OrchestratorDependencies) {
    this.prisma = deps.prisma;
    this.apolloContext = deps.apolloContext;
    this.logger = deps.logger.child({ component: 'BotOrchestrator' });
    this.tenantId = deps.tenantId;
    this.userId = deps.userId;
    this.satelliteRegistry = deps.satelliteRegistry;
  }

  async execute(botType: string, params: BotExecutionParams): Promise<BotRunResult> {
    const correlationId = params.correlationId || uuidv4();
    const logger = this.logger.child({ botType, correlationId });

    logger.info({ params: params.params }, 'Starting bot execution');

    // 1. Resolve bot runner from registry (do this first to get phase count)
    const RunnerClass = getBotRunner(botType);
    if (!RunnerClass) {
      throw new Error(`Unknown bot type: ${botType}`);
    }

    const runner: IBotRunner = new RunnerClass();
    const requiresBrowser = runner.requiresBrowser !== false;

    // 2. Create services (storage created after botRunId is available)
    const tracking = new BotTrackingService(
      this.prisma,
      this.tenantId,
      this.userId,
      logger
    );

    const notification = new BotNotificationService(
      this.prisma,
      this.tenantId,
      logger
    );

    // 3. Create BotRun record FIRST (before any validation that might fail)
    const startedAt = new Date();
    const { id: botRunId } = await tracking.createBotRun({
      botType,
      status: 'pending',
      correlationId,
      params: params.params as Record<string, unknown>,
      totalPhases: runner.phases.length,
      triggeredById: params.triggeredById,
      workerEventId: params.workerEventId,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      relatedEntityLabel: params.relatedEntityLabel,
      startedAt: startedAt,
    });

    logger.info({ botRunId }, 'BotRun created');

    // 4. Create storage service (needs botRunId for path construction)
    const storage = new BotStorageService(botRunId, botType, logger);

    // 5. Initialize browser and result
    let browserManager: BrowserManager | null = null;
    let result: BotRunResult;

    // GLOBAL try/catch - captures ALL errors after BotRun creation
    let proxyInfo: ProxyInfo | undefined;

    try {
      // 6. Validate user credentials (throws specific errors)
      const userCredentials = await this.validateUserCredentials(params.triggeredById);

      // 7. Handle region-based proxy decision
      // If regionConfig is set, detect current region and decide if proxy is needed
      let useProxy = params.useProxy;
      let requireProxy = params.requireProxy;
      let proxyOptions = params.proxyOptions;

      if (params.regionConfig) {
        const requiredCountry = params.regionConfig.countryCode.toLowerCase();
        const currentCountry = await detectCurrentRegion(logger);

        if (currentCountry === requiredCountry) {
          // Already in the required region - no proxy needed
          logger.info(
            { currentCountry, requiredCountry },
            `Already in required region (${currentCountry}), skipping proxy`
          );
          useProxy = false;
          requireProxy = false;
        } else {
          // Not in required region - must use proxy
          logger.info(
            { currentCountry, requiredCountry },
            `Not in required region (current: ${currentCountry}, required: ${requiredCountry}), proxy required`
          );
          useProxy = true;
          requireProxy = true;  // Region requirement means proxy is mandatory
          proxyOptions = { countryCode: requiredCountry };
        }
      }

      // 8. Get proxy from pool if requested
      if (useProxy) {
        if (!this.satelliteRegistry) {
          const msg = 'useProxy requested but satelliteRegistry not provided';
          if (requireProxy) {
            throw new Error(msg);
          }
          logger.warn(msg);
        } else {
          const proxyPool = new ProxyPool(this.satelliteRegistry, logger);
          proxyInfo = await proxyPool.getNextProxy(proxyOptions);

          if (!proxyInfo && requireProxy) {
            throw new Error('No proxy available and proxy is required');
          }

          if (proxyInfo) {
            logger.info(
              { satelliteId: proxyInfo.satelliteId, host: proxyInfo.host },
              'Proxy assigned from pool'
            );
          }
        }
      }

      // 9. Build config with proxy if available
      const config = this.buildConfig(params.config, proxyInfo);
      let page: BotContext['page'];
      // En modo simulación NO se lanza el browser real (ctx.page queda undefined);
      // las phases del proyecto branchean por ctx.simulation y devuelven fakes.
      if (requiresBrowser && !params.simulation?.active) {
        browserManager = new BrowserManager({ config, logger });
        const launched = await browserManager.launch();
        page = launched.page;
        // Set page reference in storage for screenshotMilestone
        storage.setPage(launched.page);
      }

      // 9. Build context
      const context: BotContext = {
        botRunId,
        botType,
        correlationId,
        page,
        simulation: params.simulation,
        storage,
        tracking,
        notification,
        logger,
        params: params.params as Record<string, unknown>,
        userCredentials,
        config,
        prisma: this.prisma,
        apolloContext: this.apolloContext,
        state: {
          currentPhase: '',
          completedPhases: [],
          phaseOutputs: {},
        },
        proxyInfo,
      };

      // 8. Initialize and run bot
      await runner.initialize(context);
      result = await runner.run();

      // 9. Check if this was a cancellation
      const wasCancelled = await tracking.isCancellationRequested(botRunId);

      // 10. Determine final status
      let finalStatus: 'completed' | 'cancelled' | 'failed' | 'requires_intervention';
      if (wasCancelled) {
        finalStatus = 'cancelled';
        result.status = 'cancelled'; // Update result to reflect cancellation
      } else if (result.status === 'completed') {
        finalStatus = 'completed';
      } else if (result.status === 'requires_intervention') {
        finalStatus = 'requires_intervention';
      } else {
        finalStatus = 'failed';
      }

      // 11. Update final status
      await tracking.updateBotRun(botRunId, {
        status: finalStatus,
        completedAt: new Date(),
        duration: result.duration,
        result: finalStatus === 'completed' ? { success: true } : undefined,
        error: result.error as unknown as Record<string, unknown>,
        completedPhases: result.completedPhases,
        requiresHumanIntervention: result.requiresHumanIntervention,
        interventionReason: wasCancelled ? 'Cancelled by user request' : result.interventionReason,
      });

      // 12. Cleanup runner
      await runner.cleanup();

      // 13. If failed with recoverable error, throw to trigger worker-level retry
      if (finalStatus === 'failed' && result.error?.recoverable) {
        logger.info({
          botRunId,
          errorType: result.error.errorType,
          recoverable: true,
        }, 'Throwing RecoverableBotError for worker-level retry');
        throw RecoverableBotError.fromBotErrorRecord(result.error, botRunId);
      }

    } catch (error) {
      // Re-throw RecoverableBotError to propagate to worker for retry
      if (error instanceof RecoverableBotError) {
        throw error;
      }
      // SimulationSuspend no es un fallo del bot: propagarlo para que el worker
      // suspenda el job (no marcar el BotRun failed/requires_intervention).
      if (error instanceof SimulationSuspend) throw error;
      const err = error as Error;
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Determine error type from message
      const isValidationError = err.message.includes('missing') ||
                                err.message.includes('required') ||
                                err.message.includes('credentials');
      const errorType = isValidationError ? 'validation_error' : 'orchestrator_error';

      logger.error({ error: err, errorType, botRunId }, 'Bot execution failed');

      const errorData = {
        errorType,
        severity: 'critical' as const,
        message: err.message,
        stackTrace: err.stack,
        context: { botType, correlationId, userId: params.triggeredById },
        recoverable: false,
        requiresHumanIntervention: true,
        timestamp: completedAt,
      };

      result = {
        status: 'failed',
        botRunId,
        startedAt,
        completedAt,
        totalPhases: runner.phases.length,
        completedPhases: 0,
        failedPhases: 1,
        duration,
        requiresHumanIntervention: true,
        error: errorData,
      };

      // ALWAYS record error in database - wrapped in try/catch to prevent silent failures
      try {
        await tracking.updateBotRun(botRunId, {
          status: 'failed',
          completedAt: completedAt,
          duration,
          error: errorData as unknown as Record<string, unknown>,
          requiresHumanIntervention: true,
          interventionReason: err.message,
        });

        // Also create BotError record for detailed error tracking
        await tracking.createBotError({
          botRunId,
          errorType,
          severity: 'critical',
          message: err.message,
          stackTrace: err.stack,
          context: { botType, correlationId, userId: params.triggeredById },
          recoverable: false,
          requiresHumanIntervention: true,
        });
      } catch (trackingError) {
        logger.error({ err: trackingError, botRunId }, 'Failed to record error in database - error will not be visible in BotRun');
      }

    } finally {
      // 11. Close browser
      if (browserManager) {
        await browserManager.close();
      }
    }

    // 12. Send notification
    try {
      const notificationStatus = result.status === 'completed' ? 'success' :
                                 result.status === 'requires_intervention' ? 'requires_intervention' : 'failed';

      // Bots con notifyClientOnFailure=false: sus fallas no se notifican al
      // cliente (la recuperación es del operador, vía /automation).
      if (notificationStatus !== 'success' && runner.notifyClientOnFailure === false) {
        logger.info(
          { botRunId, botType, status: notificationStatus },
          'Fallo operador-only: sin notificación al cliente'
        );
      } else await notification.notifyCompletion(botRunId, notificationStatus, {
        botType,
        duration: result.duration,
        totalPhases: result.totalPhases,
        completedPhases: result.completedPhases,
        errorMessage: result.error?.message,
      });
    } catch (notifyError) {
      logger.error({ error: notifyError }, 'Failed to send notification');
      // Don't fail the result because of notification error
    }

    logger.info(
      {
        botRunId,
        status: result.status,
        duration: result.duration,
        completedPhases: result.completedPhases,
        totalPhases: result.totalPhases,
      },
      'Bot execution finished'
    );

    return result;
  }

  /**
   * Validate and retrieve user credentials for bot execution.
   * Override this method in subclasses for project-specific credential validation.
   *
   * @param userId - The user ID to validate credentials for
   * @returns User credentials (project-specific structure)
   * @throws Error if user not found or credentials are invalid
   *
   * @example
   * // In project-specific subclass:
   * protected async validateUserCredentials(userId: string): Promise<DndaUserCredentials> {
   *   const user = await this.prisma.user.findUnique({ where: { id: userId } });
   *   if (!user?.idCard) throw new Error('Missing idCard');
   *   return { idCard: user.idCard, procedureNumber: user.procedureNumber, gender: user.gender };
   * }
   */
  protected async validateUserCredentials(userId: string): Promise<UserCredentials> {
    // Default implementation - just verify user exists
    // Projects should override this for specific credential validation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Return empty credentials - subclasses should provide actual credentials
    return {};
  }

  private buildConfig(overrides?: Partial<BotConfig>, proxyInfo?: ProxyInfo): BotConfig {
    const defaults: BotConfig = {
      headless: process.env.BOT_HEADLESS !== 'false',
      defaultTimeout: parseInt(process.env.BOT_DEFAULT_TIMEOUT || '30000', 10),
      defaultRetries: parseInt(process.env.BOT_DEFAULT_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.BOT_RETRY_DELAY || '2000', 10),
      retryBackoffMultiplier: parseFloat(process.env.BOT_RETRY_BACKOFF_MULTIPLIER || '1.5'),
      debugMode: process.env.BOT_DEBUG_MODE === 'true',
      screenshotOnError: process.env.BOT_SCREENSHOT_ON_ERROR !== 'false',
      screenshotOnMilestone: process.env.BOT_SCREENSHOT_ON_MILESTONE !== 'false',
      screenshotOnStep: process.env.BOT_SCREENSHOT_ON_STEP === 'true',
    };

    const config = { ...defaults, ...overrides };

    // Add proxy configuration if proxyInfo is provided
    if (proxyInfo) {
      // Via tunnel: use HTTP CONNECT proxy (server acts as HTTP proxy that routes to satellite)
      // Direct: use SOCKS5 proxy (satellite's local proxy)
      const protocol = proxyInfo.viaTunnel ? 'http' : 'socks5';
      config.proxy = {
        server: `${protocol}://${proxyInfo.host}:${proxyInfo.port}`,
        bypass: ['localhost', '127.0.0.1'],
      };

      // When using tunnel, pass satelliteId as username for HTTP Basic Auth routing
      if (proxyInfo.viaTunnel) {
        config.proxy.username = proxyInfo.satelliteId;
        config.proxy.password = 'x'; // Password required but not validated
      }
    }

    return config;
  }
}
