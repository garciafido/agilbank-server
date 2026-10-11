import type { PrismaClient } from "../prisma/generated-client/client";

/**
 * Hook genérico de dead-letter (opt-in, igual patrón que `simulationLaunchers`).
 *
 * Cuando un job de pipeline agota reintentos (o falla con error fatal) y llega a
 * `dead_letter`, el worker invoca el handler registrado para ese `pipelineId`. El
 * proyecto lo usa para que la entidad caiga en un **failure-state honesto** del
 * workflow (disparando su transición `fallar*`) en vez de quedar atascada en un
 * estado transitorio (dead-end silencioso).
 *
 * Inerte por default (cost-zero si nadie registra). El proyecto registra los
 * handlers en un módulo cargado al boot.
 */
export type DeadLetterHandler = (args: {
  pipelineId: string;
  stageId?: string;
  /** Mensaje completo del job (incluye el payload interno con la entidad). */
  payload: any;
  prisma: PrismaClient;
  logger: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
}) => Promise<void>;

export const deadLetterHandlers: Record<string, DeadLetterHandler> = {};
