import type { RetentionPolicy } from "./types";

/**
 * Auto-generated retention policies from haiku entities with .retention(days) attribute.
 * Ordered by FK dependencies: children deleted before parents.
 *
 * Generated entities:
 * - WorkerEvent: 30 days
 * - UserNotification: 180 days
 */
export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    entity: "workerEvent",
    table: "worker_event",
    retentionDays: 30,
    useService: false,
  },
  {
    entity: "userNotification",
    table: "user_notification",
    retentionDays: 180,
    useService: false,
  },
];
