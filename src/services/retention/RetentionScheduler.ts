import type { Logger } from 'pino';
import type { PGMQ } from '../../utils/pgmq';
import { RETENTION_POLICIES } from './retentionPolicies';

/**
 * Scheduler that periodically enqueues retention cleanup jobs to PGMQ.
 *
 * The actual cleanup is performed by backgroundTaskProcessor when it processes
 * the RETENTION_CLEANUP job from the background_tasks queue.
 *
 * This design ensures:
 * - Only one worker processes each cleanup job (PGMQ guarantees)
 * - Cleanup runs in the background without blocking the server
 * - Multiple server instances don't duplicate cleanup work
 */
export class RetentionScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private pgmq: PGMQ,
    private logger: Logger
  ) {}

  /**
   * Start the scheduler.
   * @param intervalHours How often to enqueue cleanup jobs (default: 24 hours)
   */
  start(intervalHours: number = 24): void {
    if (RETENTION_POLICIES.length === 0) {
      this.logger.info('No retention policies defined, scheduler not started');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.logger.info(
      {
        intervalHours,
        policiesCount: RETENTION_POLICIES.length,
        policies: RETENTION_POLICIES.map((p) => ({
          entity: p.entity,
          days: p.retentionDays,
          useService: p.useService,
        })),
      },
      'Starting retention scheduler'
    );

    // Enqueue immediately on startup (default: true, set to 'false' to disable)
    if (process.env.RETENTION_RUN_ON_STARTUP !== 'false') {
      this.enqueueCleanup();
    }

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => this.enqueueCleanup(), intervalMs);
  }

  /**
   * Stop the scheduler (for graceful shutdown).
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Retention scheduler stopped');
    }
  }

  /**
   * Enqueue a cleanup job to the background_tasks queue.
   */
  private async enqueueCleanup(): Promise<void> {
    try {
      await this.pgmq.send('background_tasks', {
        type: 'RETENTION_CLEANUP',
        data: {},
        enqueuedAt: new Date().toISOString(),
      });
      this.logger.info('Retention cleanup job enqueued');
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to enqueue retention cleanup job'
      );
    }
  }
}
