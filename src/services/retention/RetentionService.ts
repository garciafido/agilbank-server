import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { RETENTION_POLICIES } from './retentionPolicies';
import type { RetentionPolicy, RetentionCleanupResult } from './types';

/**
 * Service for cleaning up old records based on retention policies.
 *
 * Policies are generated from haiku entities with .retention(days) attribute.
 * Runs periodically via PGMQ background task.
 */
export class RetentionService {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger,
    private services?: Record<string, { delete: (id: string) => Promise<void> }>
  ) {}

  /**
   * Run cleanup for all entities with retention policies.
   * Called by backgroundTaskProcessor when RETENTION_CLEANUP job is processed.
   */
  async runCleanup(): Promise<RetentionCleanupResult[]> {
    const results: RetentionCleanupResult[] = [];

    if (RETENTION_POLICIES.length === 0) {
      this.logger.info('No retention policies defined, skipping cleanup');
      return results;
    }

    this.logger.info(
      { policiesCount: RETENTION_POLICIES.length },
      'Starting retention cleanup'
    );

    for (const policy of RETENTION_POLICIES) {
      try {
        const result = await this.cleanupEntity(policy);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          { error: errorMessage, entity: policy.entity },
          'Retention cleanup failed for entity'
        );
        results.push({
          entity: policy.entity,
          deleted: 0,
          error: errorMessage,
        });
      }
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    const errors = results.filter((r) => r.error).length;

    this.logger.info(
      { totalDeleted, entities: results.length, errors },
      'Retention cleanup completed'
    );

    return results;
  }

  /**
   * Cleanup a single entity based on its retention policy.
   */
  private async cleanupEntity(policy: RetentionPolicy): Promise<RetentionCleanupResult> {
    const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    if (policy.useService && this.services?.[policy.entity]) {
      deleted = await this.deleteWithService(policy.entity, cutoff);
    } else {
      const result = await (this.prisma as any)[policy.entity].deleteMany({
        where: { createdAt_: { lt: cutoff } },
      });
      deleted = result.count;
    }

    this.logger.info(
      {
        entity: policy.entity,
        table: policy.table,
        retentionDays: policy.retentionDays,
        useService: policy.useService,
        cutoffDate: cutoff.toISOString(),
        deleted,
      },
      'Entity retention cleanup completed'
    );

    return { entity: policy.entity, deleted };
  }

  /**
   * Delete records using the entity's service (triggers hooks like beforeDelete/afterDelete).
   * Processes in batches to avoid memory issues and allow graceful shutdown.
   */
  private async deleteWithService(entity: string, cutoff: Date): Promise<number> {
    const BATCH_SIZE = 100;
    let totalDeleted = 0;

    while (true) {
      const records = await (this.prisma as any)[entity].findMany({
        where: { createdAt_: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (records.length === 0) break;

      for (const { id } of records) {
        try {
          await this.services![entity].delete(id);
          totalDeleted++;
        } catch (error) {
          this.logger.warn(
            { entity, id, error: error instanceof Error ? error.message : String(error) },
            'Failed to delete record via service, skipping'
          );
        }
      }
    }

    return totalDeleted;
  }
}
