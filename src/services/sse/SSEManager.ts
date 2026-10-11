import { Response } from 'express';
import { basePrisma } from '../../prisma/client';
import { randomUUID } from 'crypto';

export interface SSEClient {
  id: string;
  userId: string;
  tenantId: string | null;
  roles: string[];
  res: Response;
  lastHeartbeat: number;
}

export interface SSEMessage {
  type: string;
  tenantId?: string | null;
  userId?: string | null;
  allowedRoles?: string[] | null;
  payload: any;
}

/**
 * Roles cuyo alcance NO se limita a su propio tenant: sus conexiones SSE reciben
 * los eventos tenant-scoped de cualquier tenant.
 *
 * NO es un espejo de `.crossTenantForRoles`: nada conecta el DSL con esto. El
 * valor de abajo está horneado y `setCrossTenantSseRoles` no tiene ningún
 * llamador, ni en el generador ni en los proyectos. Las dos consecuencias son
 * asimétricas y la segunda es la que importa:
 *
 *  - Un rol que el DSL declara cross-tenant y no está acá no recibe eventos de
 *    otros tenants. Falla cerrado: se ve como un panel que no se actualiza.
 *  - El nombre 'SysAdmin' recibe eventos de TODOS los tenants aunque el DSL no
 *    lo declare cross-tenant en ninguna entidad. Eso no falla cerrado, y un
 *    proyecto que use ese nombre de rol para otra cosa lo hereda sin pedirlo.
 *
 * Cerrarlo es emitir la llamada desde el generador con los roles del DSL.
 */
let crossTenantSseRoles = new Set<string>(['SysAdmin']);

export function setCrossTenantSseRoles(roles: string[]): void {
  crossTenantSseRoles = new Set(roles);
}

/**
 * Notification types that can be persisted (must match Haiku enum values)
 */
export type NotificationType = 'mention' | 'assignment' | 'comment' | 'alert' | 'system' | 'token_limit_reached';
export type NotificationPriority = 'high' | 'medium' | 'low';

/**
 * Input for creating a persistent notification
 */
export interface PersistentNotificationInput {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body?: string;
  actorUserId?: string;
  objectType?: string;
  objectId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lo que el cliente recibe de la metadata de un aviso guardado: la clave de su
 * texto (i18nKey), los parámetros y una variante opcional (el cliente busca
 * notification_<i18nKey>_<parte>_<variante> antes que notification_<i18nKey>_<parte>).
 * Nada más sale del server: la metadata puede llevar datos internos (la clave de
 * deduplicación de las alertas). Acepta la guardada como texto JSON, como la
 * guardaba createAndSendNotification antes. Sin clave, null.
 */
export function notificationMetadataForClient(
  raw: unknown
): { i18nKey: string; params: Record<string, unknown>; variant?: string } | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { i18nKey, params, variant } = value as { i18nKey?: unknown; params?: unknown; variant?: unknown };
  if (typeof i18nKey !== 'string' || i18nKey === '') return null;
  return {
    i18nKey,
    params: params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {},
    ...(typeof variant === 'string' && variant !== '' ? { variant } : {}),
  };
}

export class SSEManager {
  private static instance: SSEManager;
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly CONNECTION_TIMEOUT = 90000;

  private constructor() {
    this.startHeartbeat();
  }

  static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  addClient(client: SSEClient): void {
    this.clients.set(client.id, client);

    client.res.on('close', () => {
      this.removeClient(client.id);
    });
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
    }
  }

  sendToClient(clientId: string, message: SSEMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      client.res.write(`data: ${JSON.stringify(message)}\n\n`);
      client.res.flush?.();
      return true;
    } catch (error) {
      console.error(`[SSE] Error sending to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  publish(message: SSEMessage): number {
    let sentCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      if (!this.shouldReceiveMessage(client, message)) {
        continue;
      }

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Create a persistent notification and send via SSE
   * This is the preferred method for sending notifications - persist first, then emit.
   */
  async createAndSendNotification(
    targetUserId: string,
    targetTenantId: string,
    input: PersistentNotificationInput
  ): Promise<{ notificationId: string; sentToClient: boolean }> {
    // Sin el contrato de notificaciones no hay dónde persistir: no-op explícito.
    if (!(basePrisma as any).userNotification) {
      return { notificationId: "", sentToClient: false };
    }

    const now = new Date();

    // Persist notification to database
    const notification = await basePrisma.userNotification.create({
      data: {
        tenant_: { connect: { id: targetTenantId } },
        createdBy_: { connect: { id: targetUserId } },
        lastUpdatedBy_: { connect: { id: targetUserId } },
        type: input.type,
        priority: input.priority || 'medium',
        title: input.title,
        body: input.body || null,
        actorUser: input.actorUserId ? { connect: { id: input.actorUserId } } : undefined,
        objectType: input.objectType || null,
        objectId: input.objectId || null,
        actionUrl: input.actionUrl || null,
        // Como objeto (jsonb), igual que createAlertNotification: se puede
        // consultar por camino y el cliente recibe la clave de su texto.
        metadata: input.metadata ? (input.metadata as any) : undefined,
        version_: randomUUID(),
        createdAt_: now,
        lastUpdatedAt_: now,
      },
      include: {
        actorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Send via SSE to the target user
    const sentCount = this.publish({
      type: 'notification',
      userId: targetUserId,
      tenantId: targetTenantId,
      payload: {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        body: notification.body,
        actorUser: notification.actorUser,
        objectType: notification.objectType,
        objectId: notification.objectId,
        actionUrl: notification.actionUrl,
        metadata: notificationMetadataForClient(notification.metadata),
        createdAt: notification.createdAt_?.toISOString(),
        isNew: true,
      },
    });

    return {
      notificationId: notification.id,
      sentToClient: sentCount > 0,
    };
  }

  /**
   * Send notifications to multiple users (e.g., all SysAdmins)
   */
  async createAndSendNotificationToMultiple(
    targetUserIds: Array<{ userId: string; tenantId: string }>,
    input: PersistentNotificationInput
  ): Promise<{ count: number; notificationIds: string[] }> {
    const results = await Promise.all(
      targetUserIds.map(({ userId, tenantId }) =>
        this.createAndSendNotification(userId, tenantId, input)
      )
    );

    return {
      count: results.length,
      notificationIds: results.map((r) => r.notificationId),
    };
  }

  /**
   * Load unread notifications for a user (called when SSE client connects)
   */
  async loadUnreadNotifications(userId: string, tenantId: string): Promise<number> {
    // Proyectos sin el contrato de notificaciones no declaran UserNotification:
    // no hay nada para cargar.
    if (!(basePrisma as any).userNotification) {
      return 0;
    }

    const client = Array.from(this.clients.values()).find(
      (c) => c.userId === userId && c.tenantId === tenantId
    );

    if (!client) {
      return 0;
    }

    // Get unread notifications (last 50)
    const notifications = await basePrisma.userNotification.findMany({
      where: {
        createdBy_: { id: userId },
        tenant_: { id: tenantId },
        readAt: null,
        archivedAt: null,
      },
      orderBy: { createdAt_: 'desc' },
      take: 50,
      include: {
        actorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (notifications.length === 0) {
      return 0;
    }

    // Send unread notifications to client
    this.sendToClient(client.id, {
      type: 'notifications.unread',
      payload: {
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          priority: n.priority,
          title: n.title,
          body: n.body,
          actorUser: n.actorUser,
          objectType: n.objectType,
          objectId: n.objectId,
          actionUrl: n.actionUrl,
          metadata: notificationMetadataForClient(n.metadata),
          createdAt: n.createdAt_?.toISOString(),
        })),
        count: notifications.length,
      },
    });

    return notifications.length;
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    if (!(basePrisma as any).userNotification) {
      return 0;
    }
    const count = await basePrisma.userNotification.count({
      where: {
        createdBy_: { id: userId },
        tenant_: { id: tenantId },
        readAt: null,
        archivedAt: null,
      },
    });

    return count;
  }

  private shouldReceiveMessage(client: SSEClient, message: SSEMessage): boolean {
    if (message.tenantId !== undefined && message.tenantId !== null) {
      // Una conexión de un rol cross-tenant recibe eventos tenant-scoped de
      // CUALQUIER tenant. La lista sale de `crossTenantSseRoles`, que está
      // horneada y no la alimenta el DSL — ver su comentario. Sin esto, el SysAdmin
      // (que vive en el tenant del operador) trabajando una entidad de otro
      // tenant nunca recibía sus eventos — caso real: firma completada sin
      // navegación ni refetch, panel congelado mostrando data vieja. El filtro
      // por userId de abajo sigue intacto: las notificaciones personales no se
      // reparten cross-tenant.
      const crossTenant = client.roles.some((r) => crossTenantSseRoles.has(r));
      if (!crossTenant && client.tenantId !== message.tenantId) {
        return false;
      }
    }

    if (message.userId !== undefined && message.userId !== null) {
      if (client.userId !== message.userId) {
        return false;
      }
    }

    if (message.allowedRoles && message.allowedRoles.length > 0) {
      const hasRole = message.allowedRoles.some(role => client.roles.includes(role));
      if (!hasRole) {
        return false;
      }
    }

    return true;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastHeartbeat = now - client.lastHeartbeat;

        if (timeSinceLastHeartbeat > this.CONNECTION_TIMEOUT) {
          staleClients.push(clientId);
        } else {
          try {
            client.res.write(': heartbeat\n\n');
            client.lastHeartbeat = now;
          } catch (error) {
            staleClients.push(clientId);
          }
        }
      }

      staleClients.forEach(clientId => this.removeClient(clientId));
    }, this.HEARTBEAT_INTERVAL);
  }

  async publishSystemStatus(): Promise<number> {
    const status = await basePrisma.systemStatus.findUnique({
      where: { id: 'system' }
    });

    if (!status) {
      return 0;
    }

    return this.publish({
      type: 'system.status',
      payload: {
        status: status.status,
        message: status.message,
        scheduledAt: status.scheduledAt,
        startedAt: status.startedAt,
        estimatedEnd: status.estimatedEnd,
        updatedAt: status.updatedAt
      }
    });
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        userId: c.userId,
        tenantId: c.tenantId,
        roles: c.roles,
        lastHeartbeat: new Date(c.lastHeartbeat).toISOString()
      }))
    };
  }

  dispose(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.res.end();
      } catch (error) {
        console.error(`[SSE] Error closing client ${clientId}:`, error);
      }
    }

    this.clients.clear();
    console.log('[SSE] SSEManager disposed');
  }
}

export const sseManager = SSEManager.getInstance();
