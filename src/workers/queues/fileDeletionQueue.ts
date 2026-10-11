import { pgmq, type PgmqWriteClient } from "../../utils/pgmq";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";
import { basePrisma } from "../../prisma/client";
import { randomUUID } from "crypto";

export interface FileDeletionPayload {
  entityType: string;
  entityId: string;
  tenantId?: string;
  files: Array<{
    fieldName: string;
    serverData: { baseName: string; filename: string };
  }>;
  timestamp: Date;
  workerEventId?: string;
  _retryAttempt?: number;
}

const QUEUE_NAME = "file_deletions";

/** El cliente de una transacción en curso: escribe el evento y publica el mensaje. */
export type FileDeletionTxClient = PgmqWriteClient & Pick<PrismaClient, "workerEvent">;

/**
 * Encola el borrado de archivos que quedaron sin dueño.
 *
 * @param userId - quién lo disparó, para la auditoría
 * @param client - el cliente de la transacción que provocó el descarte. PASARLO
 *   SIEMPRE que se llame desde adentro de una: el mensaje y la fila que lo
 *   justifica tienen que hacerse visibles juntos.
 *
 *   Sin el cliente, el encolado commitea por su cuenta. Si la operación después
 *   revierte —una validación, un conflicto de versión, un hook que falla— la
 *   fila queda intacta y el mensaje YA salió: el worker borra los archivos de
 *   un registro que nunca cambió. Eso no es una inconsistencia que se
 *   reconcilia: los archivos no vuelven.
 */
export async function enqueueFilesDeletion(
  entityType: string,
  entityId: string,
  files: FileDeletionPayload["files"],
  userId: string,
  tenantId?: string,
  client?: FileDeletionTxClient
): Promise<void> {
  // Skip if no files to delete
  if (!files || files.length === 0) {
    return;
  }

  try {
    // Create WorkerEvent for tracking
    // El WorkerEvent es la contraparte visible del mensaje: si el mensaje va en
    // la transacción, el evento también, o queda un rastro de algo que no pasó.
    const db = client ?? basePrisma;
    const workerEvent = await db.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'file_deletion',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: {
          entityType,
          entityId,
          fileCount: files.length,
          fieldNames: files.map(f => f.fieldName)
        },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: userId } },
        triggerUserId: { connect: { id: userId } },
        ...(tenantId ? { tenant_: { connect: { id: tenantId } } } : {})
      }
    });

    const payload: FileDeletionPayload = {
      entityType,
      entityId,
      files,
      tenantId,
      timestamp: new Date(),
      workerEventId: workerEvent.id,
      _retryAttempt: 1
    };

    await pgmq.send(QUEUE_NAME, payload, undefined, client);

    logger.info(
      {
        entityType,
        entityId,
        fileCount: files.length,
        fieldNames: files.map(f => f.fieldName),
        workerEventId: workerEvent.id
      },
      "Files deletion enqueued"
    );
  } catch (error) {
    // Adentro de una transacción el error NO se puede tragar: Postgres ya dejó
    // la transacción abortada y el llamador merece ver la causa real y no un
    // "current transaction is aborted" varias sentencias más adelante.
    // Fuera de una, sí: los archivos quedan huérfanos y la barrida los junta;
    // hacer fallar la escritura del usuario por eso sería peor.
    if (client) throw error;
    logger.error(
      {
        entityType,
        entityId,
        fileCount: files.length,
        error
      },
      "Failed to enqueue files deletion - files may remain orphaned"
    );
  }
}
