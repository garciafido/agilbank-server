import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

export interface DeadLetterInfo {
  queueName: string;
  attempts: number;
  /** true si era recuperable y agotó los reintentos; false si fue no-recuperable. */
  recoverable: boolean;
  lastError: string;
  /** Payload del job muerto (puede tener workerEventId para resolver tenant + jobType). */
  payload: unknown;
}

/**
 * Notifica a los SysAdmins del tenant que un job automatizado murió en la cola
 * muerta (DLQ) — el punto muerto de un proceso automatizado. Genérico: sirve
 * para cualquier bot o pipeline. Encola un email vía la cola `email_notifications`
 * (igual que BotNotificationService). No tira: una falla de notificación no debe
 * romper el worker.
 *
 * El tenant se resuelve del WorkerEvent original (payload.workerEventId). Si no
 * se puede determinar, se loguea y se omite (no hay a quién avisar de forma
 * scopeada por tenant).
 */
export async function notifyDeadLetter(
  prisma: PrismaClient,
  logger: Logger,
  info: DeadLetterInfo
): Promise<void> {
  try {
    const workerEventId = (info.payload as { workerEventId?: string } | null)
      ?.workerEventId;

    let tenantId: string | undefined;
    let jobType = info.queueName;
    if (workerEventId) {
      const we = await prisma.workerEvent.findUnique({
        where: { id: workerEventId },
        select: { tenant_id_: true, jobType: true },
      });
      tenantId = we?.tenant_id_ ?? undefined;
      if (we?.jobType) jobType = we.jobType;
    }

    if (!tenantId) {
      logger.warn(
        { jobType, queueName: info.queueName },
        "[DLQ notify] No se pudo determinar el tenant — no se notifica"
      );
      return;
    }

    const sysAdmins = await prisma.user.findMany({
      where: {
        tenant_id_: tenantId,
        active: true,
        role: { id: "SysAdmin" },
      },
      select: { id: true, email: true },
    });

    if (sysAdmins.length === 0) {
      logger.warn(
        { tenantId, jobType: jobType },
        "[DLQ notify] No hay SysAdmins para notificar"
      );
      return;
    }

    const createdById = sysAdmins[0].id;
    const subject = `⛔ Proceso automatizado atascado (DLQ): ${jobType}`;
    const body = [
      "Un job automatizado falló definitivamente y se movió a la cola muerta (DLQ).",
      "Requiere intervención del administrador.",
      "",
      `Tipo: ${jobType}`,
      `Cola: ${info.queueName}`,
      `Intentos: ${info.attempts}`,
      `Recuperable: ${info.recoverable ? "sí (agotó los reintentos)" : "no"}`,
      "",
      "Último error:",
      info.lastError,
    ].join("\n");

    for (const admin of sysAdmins) {
      await prisma.workerEvent.create({
        data: {
          queueName: "email_notifications",
          jobType: "dead_letter_alert",
          status: "queued",
          enqueuedAt: new Date(),
          payload: {
            to: admin.email,
            subject,
            body,
            template: "dead_letter_alert",
            templateData: {
              jobType: jobType,
              queueName: info.queueName,
              attempts: info.attempts,
              recoverable: info.recoverable,
              lastError: info.lastError,
            },
          },
          tenant_: { connect: { id: tenantId } },
          createdBy_: { connect: { id: createdById } },
        },
      });
    }

    logger.info(
      { tenantId, jobType: jobType, recipients: sysAdmins.length },
      "[DLQ notify] Notificación de cola muerta encolada a SysAdmins"
    );
  } catch (error) {
    logger.error(
      { error, queueName: info.queueName },
      "[DLQ notify] Falló al encolar la notificación de DLQ"
    );
  }
}
