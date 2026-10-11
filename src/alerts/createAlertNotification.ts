/**
 * Crea una UserNotification(type='alert') desde el WORKER (otro proceso, sin clientes
 * SSE en memoria) respetando UserNotificationPreference del usuario, y la empuja a la
 * campanita vía Redis 'sse:events' (el API server reenvía). Espejo cross-proceso de
 * SSEManager.createAndSendNotification. Email inmediato vía cola 'email_notifications'.
 *
 * `metadata` se guarda como OBJETO jsonb (incluye `alertDedupKey`) para que el motor
 * deduplique por path; el cliente no lee metadata (el resolver myNotifications no la
 * expone), así que es server-interno.
 */

import { PrismaClient } from "../prisma/generated-client/client";
import type Redis from "ioredis";
import type { Logger } from "pino";
import { randomUUID } from "crypto";
import { enqueueAlertEmail } from "../workers/queues/emailQueue";
import { runAfterCommit } from "../common/services/transactionScope";

export type AlertNotificationInput = {
  userId: string;
  tenantId: string;
  title: string;
  body?: string;
  priority?: "high" | "medium" | "low";
  objectType?: string;
  objectId?: string;
  actionUrl?: string;
  /** Clave de dedup ya compuesta por el motor (incluye el userId). */
  dedupKey: string;
  /** Fuerza el email ignorando UserNotificationPreference (alertas operacionales). */
  forceEmail?: boolean;
  metadata?: Record<string, unknown>;
};

export async function createAlertNotification(
  prisma: PrismaClient,
  redis: Redis,
  input: AlertNotificationInput,
  logger: Logger
): Promise<void> {
  const pref = await prisma.userNotificationPreference.findFirst({
    where: {
      createdBy_id_: input.userId,
      tenant_id_: input.tenantId,
      notificationType: "alert",
    },
    select: { inAppEnabled: true, emailEnabled: true },
  });
  const inAppEnabled = pref?.inAppEnabled ?? true; // defaults del entity
  const emailEnabled = input.forceEmail || (pref?.emailEnabled ?? false);

  const now = new Date();
  const priority = input.priority ?? "medium";

  if (inAppEnabled) {
    const notification = await prisma.userNotification.create({
      data: {
        tenant_: { connect: { id: input.tenantId } },
        createdBy_: { connect: { id: input.userId } },
        lastUpdatedBy_: { connect: { id: input.userId } },
        type: "alert",
        priority,
        title: input.title,
        body: input.body ?? null,
        objectType: input.objectType ?? null,
        objectId: input.objectId ?? null,
        actionUrl: input.actionUrl ?? null,
        metadata: { ...(input.metadata ?? {}), alertDedupKey: input.dedupKey } as any,
        version_: randomUUID(),
        createdAt_: now,
        lastUpdatedAt_: now,
      },
      select: {
        id: true, type: true, priority: true, title: true, body: true,
        objectType: true, objectId: true, actionUrl: true, createdAt_: true,
      },
    });

    // La fila de la notificación puede estar naciendo adentro de una
    // transacción del llamador (así la usa el aviso de créditos insuficientes).
    // Sin diferir, el cliente recibía la campanita y al ir a buscar la
    // notificación no la encontraba; y si la transacción revertía, quedaba
    // avisado de algo que no existe.
    await runAfterCommit(async () => {
      try {
        await redis.publish("sse:events", JSON.stringify({
          type: "notification",
          userId: input.userId,
          tenantId: input.tenantId,
          payload: {
            id: notification.id,
            type: notification.type,
            priority: notification.priority,
            title: notification.title,
            body: notification.body,
            objectType: notification.objectType,
            objectId: notification.objectId,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt_?.toISOString(),
            isNew: true,
          },
        }));
      } catch (e) {
        logger.warn({ err: e, userId: input.userId }, "[alerts] Failed to publish SSE notification");
      }
    });
  }

  if (emailEnabled) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (user?.email) {
      // Encola por el canal que SÍ entrega (WorkerEvent + pgmq.send + processor 'alert').
      await enqueueAlertEmail({
        email: user.email,
        userId: input.userId,
        tenantId: input.tenantId,
        subject: input.title,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      });
    }
  }
}
