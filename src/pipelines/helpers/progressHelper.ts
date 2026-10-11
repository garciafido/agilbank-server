import { redis } from '../../services/redis/redisClient';
import { runAfterCommit } from '../../common/services/transactionScope';

/**
 * Helper para actualizar progreso en BD y notificar vía SSE tenant-wide
 */
export async function updateProgressAndNotify(
  workerEventId: string,
  current: number,
  total: number,
  tenantId: string,
  pipelineId: string,
  stageId: string,
  txPrisma: any,
  additionalData?: any
): Promise<void> {
  // 1. Actualizar WorkerEvent en BD
  await txPrisma.workerEvent.update({
    where: { id: workerEventId },
    data: {
      result: {
        progress: Math.round((current / total) * 100),
        current,
        total,
        ...additionalData
      }
    }
  });

  // 2. Notificar vía SSE a todo el tenant (via Redis Pub/Sub)
  try {
    await redis.publish('sse:events', JSON.stringify({
      type: 'pipeline.stage.progress',
      tenantId: tenantId,
      payload: {
        workerEventId,
        pipelineId,
        stageId,
        current,
        total,
        percentage: Math.round((current / total) * 100),
        ...additionalData
      }
    }));
  } catch (error) {
    console.error(`[progressHelper] Error publishing SSE event to Redis:`, error);
  }
}

/**
 * Publicar evento de inicio de stage
 */
export async function publishStageStarted(
  workerEventId: string,
  pipelineId: string,
  stageId: string,
  tenantId: string,
  metadata?: any
): Promise<void> {
  try {
    await redis.publish('sse:events', JSON.stringify({
      type: 'pipeline.stage.started',
      tenantId: tenantId,
      payload: {
        workerEventId,
        pipelineId,
        stageId,
        ...metadata
      }
    }));
  } catch (error) {
    console.error(`[progressHelper] Error publishing start event to Redis:`, error);
  }
}

/**
 * Publicar evento de completado de stage
 */
/**
 * A diferencia de `started`, `progress` y `retrying` —que son señales de "en
 * vuelo" y tienen que salir mientras el stage trabaja—, `completed` afirma un
 * hecho consumado. El stage lo llama como última línea, todavía adentro de la
 * transacción: si el commit después falla, la UI habría dicho "listo" sobre algo
 * que se revirtió. Por eso sale al commitear, y no sale si se revirtió — en ese
 * caso el worker publica `failed`, que es la verdad.
 */
export async function publishStageCompleted(
  workerEventId: string,
  pipelineId: string,
  stageId: string,
  tenantId: string,
  result: any,
  duration: number
): Promise<void> {
  await runAfterCommit(async () => {
    await redis.publish('sse:events', JSON.stringify({
      type: 'pipeline.stage.completed',
      tenantId: tenantId,
      payload: {
        workerEventId,
        pipelineId,
        stageId,
        result,
        duration
      }
    }));
  });
}

/**
 * Publicar evento de fallo de stage
 * Incluye detalles estructurados del error si están disponibles (ValidationError, etc.)
 */
export async function publishStageFailed(
  workerEventId: string,
  pipelineId: string,
  stageId: string,
  tenantId: string,
  error: any,
  // affectedEntity: el cliente recarga ese store para reflejar el failure-state.
  affectedEntity?: { entityType: string; entityId: string }
): Promise<void> {
  try {
    // Extraer detalles estructurados del error si existen
    const meta = error?.meta ?? error?.extensions?.meta;
    const errorPayload: any = {
      message: error?.message || String(error),
    };
    if (meta) {
      errorPayload.code = meta.code;
      errorPayload.validationErrors = meta.validationErrors;
      errorPayload.suggestedAction = meta.suggestedAction;
      // Detalle estructurado para que el cliente renderice una lista legible
      // (p.ej. editoriales sin firmante) en vez de texto entre paréntesis.
      errorPayload.detailType = meta.detailType;
      errorPayload.items = meta.items;
      if (meta.contractNumber) errorPayload.contractNumber = meta.contractNumber;
    }

    // Scoping por contenido: un error ACCIONABLE por el usuario (ValidationError
    // estructurada con code/items — ej. "editoriales sin firmante") llega al
    // tenant; un error TECNICO crudo (timeout de bot, stack) es material del
    // operador y va SOLO a SysAdmin — el tenant no debe ver internals.
    const isUserActionable = Boolean(meta?.code);

    await redis.publish('sse:events', JSON.stringify({
      type: 'pipeline.stage.failed',
      tenantId: tenantId,
      ...(isUserActionable ? {} : { allowedRoles: ['SysAdmin'] }),
      payload: {
        workerEventId,
        pipelineId,
        stageId,
        // final=true: es el fallo DEFINITIVO (agotó reintentos o error fatal).
        // El worker publica esto solo al dead-letter — NUNCA por intento, para no
        // alarmar mientras el proceso todavía se auto-recupera.
        final: true,
        error: errorPayload,
        ...(affectedEntity ? { affectedEntity } : {}),
      }
    }));
  } catch (redisError) {
    console.error(`[progressHelper] Error publishing failure event to Redis:`, redisError);
  }
}

/**
 * Publicar evento de REINTENTO de stage. Señal CALMA: el proceso falló este
 * intento pero el worker lo va a reintentar automáticamente. El cliente lo
 * muestra como "reintentando" (no como error), así no se asusta al usuario
 * mientras el sistema se auto-recupera.
 */
export async function publishStageRetrying(
  workerEventId: string,
  pipelineId: string,
  stageId: string,
  tenantId: string,
  attempt: number,
  maxAttempts: number,
  nextRetryInSeconds: number,
  affectedEntity?: { entityType: string; entityId: string }
): Promise<void> {
  try {
    await redis.publish('sse:events', JSON.stringify({
      type: 'pipeline.stage.retrying',
      tenantId: tenantId,
      payload: {
        workerEventId,
        pipelineId,
        stageId,
        attempt,
        maxAttempts,
        nextRetryInSeconds,
        ...(affectedEntity ? { affectedEntity } : {}),
      }
    }));
  } catch (redisError) {
    console.error(`[progressHelper] Error publishing retrying event to Redis:`, redisError);
  }
}

/**
 * Publicar evento de una sesión de simulación (gate waiting/advanced/failed/etc.)
 * para que la UI observe y controle el circuito simulado en vivo.
 */
export async function publishSimulationEvent(args: {
  sessionId: string;
  tenantId: string;
  type: 'running' | 'waiting' | 'advanced' | 'failed' | 'completed' | 'aborted';
  gate?: string;
  label?: string;
}): Promise<void> {
  try {
    await redis.publish('sse:events', JSON.stringify({
      type: `simulation.${args.type}`,
      tenantId: args.tenantId,
      payload: {
        sessionId: args.sessionId,
        gate: args.gate,
        label: args.label,
      }
    }));
  } catch (error) {
    console.error(`[progressHelper] Error publishing simulation event to Redis:`, error);
  }
}
