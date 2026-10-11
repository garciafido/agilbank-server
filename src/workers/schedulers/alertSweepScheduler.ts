/**
 * Alert Sweep Scheduler
 *
 * Corre el motor de alertas (alerts/engine.ts) periódicamente desde el worker.
 * Cableado built-in en worker.ts runScheduledTasks (cadencia global ~1h); el motor
 * respeta la cadencia por-tipo y es no-op si no hay reglas/evaluadores.
 */

import { PrismaClient } from "../../prisma/generated-client/client";
import type { Logger } from "pino";
import type Redis from "ioredis";
import { runAlertSweep } from "../../alerts/engine";

export async function runAlertSweepCheck(
  prisma: PrismaClient,
  logger: Logger,
  redis: Redis
): Promise<number> {
  // Módulo opcional: si el proyecto no declara la entidad, el modelo no
  // existe en el cliente prisma y este tick es un no-op.
  if (!(prisma as any).alertRule) return 0;
  try {
    return await runAlertSweep(prisma, logger, redis);
  } catch (err) {
    logger.error({ err }, "[alertSweep] sweep failed");
    return 0;
  }
}
