/**
 * Retention Policy Types
 *
 * Defines the structure for automatic data retention/purge policies.
 */

export interface RetentionPolicy {
  /** PascalCase entity name for Prisma (e.g., 'satelliteHeartbeat') */
  entity: string;

  /** snake_case table name for logging */
  table: string;

  /** Number of days to retain records */
  retentionDays: number;

  /** If true, use service.delete() which triggers hooks; if false, use deleteMany directly */
  useService: boolean;
}

export interface RetentionCleanupResult {
  entity: string;
  deleted: number;
  error?: string;
}
