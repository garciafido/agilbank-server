/**
 * Notifications GraphQL Resolver
 *
 * Handles queries and mutations for the UserNotification entity.
 * Provides user-specific notification management functionality.
 */

import { Resolvers } from '../../../graphql/types';
import { UnauthorizedError, NotFoundError } from '../../../common/errors';
import { randomUUID } from 'crypto';

export const notificationsResolvers: Resolvers = {
  Query: {
    /**
     * Get current user's notifications with optional filters
     */
    myNotifications: async (_parent, args, context) => {
      if (!context.currentUser?.id || !context.currentUser.active) {
        throw new UnauthorizedError('Usuario no autenticado');
      }

      // Proyectos sin el contrato de notificaciones: campana vacía, sin error.
      if (!(context.prisma as any).userNotification) {
        return { notifications: [], totalCount: 0, hasMore: false };
      }

      const userId = context.currentUser.id;
      const tenantId = context.currentUser.tenant_id_;
      const limit = Math.min(args.limit || 50, 100);
      const offset = args.offset || 0;

      // Build where clause
      const where: any = {
        createdBy_id_: userId,
        tenant_id_: tenantId,
        archivedAt: null, // Exclude archived by default
      };

      if (args.unreadOnly) {
        where.readAt = null;
      }

      if (args.type) {
        where.type = args.type;
      }

      // Get total count
      const totalCount = await context.prisma.userNotification.count({ where });

      // Get notifications
      const notifications = await context.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt_: 'desc' },
        take: limit + 1, // Fetch one more to check hasMore
        skip: offset,
        include: {
          actorUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Check if there are more
      const hasMore = notifications.length > limit;
      const results = hasMore ? notifications.slice(0, -1) : notifications;

      return {
        notifications: results.map((n) => ({
          id: n.id,
          type: n.type,
          priority: n.priority,
          title: n.title,
          body: n.body,
          actorUser: n.actorUser
            ? {
                id: n.actorUser.id,
                name: n.actorUser.name,
                email: n.actorUser.email,
              }
            : null,
          objectType: n.objectType,
          objectId: n.objectId,
          actionUrl: n.actionUrl,
          readAt: n.readAt?.toISOString() || null,
          archivedAt: n.archivedAt?.toISOString() || null,
          createdAt: n.createdAt_?.toISOString() || new Date().toISOString(),
        })),
        totalCount,
        hasMore,
      };
    },

    /**
     * Get count of unread notifications
     */
    unreadNotificationCount: async (_parent, _args, context) => {
      if (!context.currentUser?.id || !context.currentUser.active) {
        throw new UnauthorizedError('Usuario no autenticado');
      }

      if (!(context.prisma as any).userNotification) {
        return 0;
      }

      const count = await context.prisma.userNotification.count({
        where: {
          createdBy_id_: context.currentUser.id,
          tenant_id_: context.currentUser.tenant_id_,
          readAt: null,
          archivedAt: null,
        },
      });

      return count;
    },
  },

  Mutation: {
    /**
     * Mark a single notification as read
     */
    markNotificationRead: async (_parent, args, context) => {
      if (!context.currentUser?.id || !context.currentUser.active) {
        throw new UnauthorizedError('Usuario no autenticado');
      }

      const userId = context.currentUser.id;
      const tenantId = context.currentUser.tenant_id_;

      // Find notification and verify ownership
      const notification = await context.prisma.userNotification.findFirst({
        where: {
          id: args.id,
          createdBy_id_: userId,
          tenant_id_: tenantId,
        },
        include: {
          actorUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!notification) {
        return {
          success: false,
          notification: null,
          error: 'Notificación no encontrada',
        };
      }

      // Already read
      if (notification.readAt) {
        return {
          success: true,
          notification: mapNotification(notification),
          error: null,
        };
      }

      // Mark as read
      const updated = await context.prisma.userNotification.update({
        where: { id: args.id },
        data: {
          readAt: new Date(),
          version_: randomUUID(),
          lastUpdatedAt_: new Date(),
        },
        include: {
          actorUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return {
        success: true,
        notification: mapNotification(updated),
        error: null,
      };
    },

    /**
     * Mark all notifications as read
     */
    markAllNotificationsRead: async (_parent, _args, context) => {
      if (!context.currentUser?.id || !context.currentUser.active) {
        throw new UnauthorizedError('Usuario no autenticado');
      }

      const result = await context.prisma.userNotification.updateMany({
        where: {
          createdBy_id_: context.currentUser.id,
          tenant_id_: context.currentUser.tenant_id_,
          readAt: null,
          archivedAt: null,
        },
        data: {
          readAt: new Date(),
          lastUpdatedAt_: new Date(),
        },
      });

      return result.count;
    },

    /**
     * Archive a notification
     */
    archiveNotification: async (_parent, args, context) => {
      if (!context.currentUser?.id || !context.currentUser.active) {
        throw new UnauthorizedError('Usuario no autenticado');
      }

      const userId = context.currentUser.id;
      const tenantId = context.currentUser.tenant_id_;

      // Find notification and verify ownership
      const notification = await context.prisma.userNotification.findFirst({
        where: {
          id: args.id,
          createdBy_id_: userId,
          tenant_id_: tenantId,
        },
      });

      if (!notification) {
        return {
          success: false,
          notification: null,
          error: 'Notificación no encontrada',
        };
      }

      // Archive
      const updated = await context.prisma.userNotification.update({
        where: { id: args.id },
        data: {
          archivedAt: new Date(),
          version_: randomUUID(),
          lastUpdatedAt_: new Date(),
        },
        include: {
          actorUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return {
        success: true,
        notification: mapNotification(updated),
        error: null,
      };
    },
  },
};

/**
 * Map database notification to GraphQL type
 */
function mapNotification(n: any) {
  return {
    id: n.id,
    type: n.type,
    priority: n.priority,
    title: n.title,
    body: n.body,
    actorUser: n.actorUser
      ? {
          id: n.actorUser.id,
          name: n.actorUser.name,
          email: n.actorUser.email,
        }
      : null,
    objectType: n.objectType,
    objectId: n.objectId,
    actionUrl: n.actionUrl,
    readAt: n.readAt?.toISOString() || null,
    archivedAt: n.archivedAt?.toISOString() || null,
    createdAt: n.createdAt_?.toISOString() || new Date().toISOString(),
  };
}
