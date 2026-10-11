import type { PrismaClient } from "../prisma/generated-client/client";

/**
 * Precondiciones de stage (opt-in, igual patrón que `deadLetterHandlers`).
 *
 * Un mensaje de pipeline puede ejecutarse mucho después de ser encolado
 * (reintentos con backoff, redelivery por visibility-timeout, retry manual).
 * Para entonces la entidad puede haber avanzado de estado — re-ejecutar un
 * stage destructivo sobre una entidad que ya avanzó corrompe datos (p.ej.
 * borrar documentación ya enviada a firma).
 *
 * El worker evalúa la precondición registrada para el `pipelineId` ANTES de
 * instanciar el service, en cada intento (primero, reintento automático,
 * reintento manual y redelivery). Si no se cumple, el job se marca
 * `superseded`: el mensaje se descarta SIN reintentos ni dead-letter — el
 * mundo avanzó y el job ya no corresponde, no es un fallo.
 *
 * Inerte por default (cost-zero si nadie registra). El proyecto registra las
 * precondiciones en un módulo cargado al boot.
 */

export interface StagePreconditionArgs {
  pipelineId: string;
  stageId: string;
  /** Mensaje completo del job (input interno, workerEventId, timestamp de enqueue). */
  payload: any;
  prisma: PrismaClient;
  logger: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
}

export type StagePreconditionResult = { ok: true } | { ok: false; reason: string };

export interface StagePrecondition {
  /**
   * Frescura: si el mensaje fue encolado hace más de `maxAgeMs`, se descarta
   * como superseded aunque `check` no esté definido. Defensa en profundidad
   * contra reintentos con horizonte largo sobre stages dependientes de estado.
   */
  maxAgeMs?: number;
  /**
   * Validación de estado: típicamente re-lee la entidad y verifica que su
   * workflow-state y/o versión sigan siendo los que el stage espera.
   */
  check?: (args: StagePreconditionArgs) => Promise<StagePreconditionResult>;
}

export const stagePreconditions: Record<string, StagePrecondition> = {};

export async function evaluateStagePrecondition(
  args: StagePreconditionArgs
): Promise<StagePreconditionResult> {
  const pre = stagePreconditions[args.pipelineId];
  if (!pre) return { ok: true };

  if (pre.maxAgeMs != null) {
    const enqueuedAt = args.payload?.timestamp ? new Date(args.payload.timestamp).getTime() : NaN;
    if (!Number.isNaN(enqueuedAt)) {
      const ageMs = Date.now() - enqueuedAt;
      if (ageMs > pre.maxAgeMs) {
        return {
          ok: false,
          reason: `stale message: encolado hace ${Math.round(ageMs / 1000)}s (máximo ${Math.round(pre.maxAgeMs / 1000)}s)`,
        };
      }
    }
  }

  if (pre.check) {
    return pre.check(args);
  }

  return { ok: true };
}
