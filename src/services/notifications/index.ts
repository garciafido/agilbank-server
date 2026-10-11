/**
 * Notifications Service
 *
 * Provides persistent notification functionality with:
 * - Database persistence (UserNotification entity)
 * - Real-time delivery via SSE
 * - GraphQL API for querying and managing notifications
 *
 * Usage:
 * 1. Import SSEManager for creating notifications: sseManager.createAndSendNotification()
 * 2. GraphQL API handles user queries: myNotifications, unreadNotificationCount
 * 3. GraphQL mutations: markNotificationRead, markAllNotificationsRead, archiveNotification
 */

export { notificationsResolvers, notificationsSchemaPath } from './graphql';
export {
  sseManager,
  PersistentNotificationInput,
  NotificationType,
  NotificationPriority,
} from '../sse/SSEManager';
