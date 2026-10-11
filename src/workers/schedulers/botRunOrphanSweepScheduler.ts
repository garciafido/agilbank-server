/**
 * Barrido de BotRuns huérfanos.
 *
 * Un BotRun queda en `running` para siempre si el worker muere a mitad de una
 * corrida (reinicio por deploy/rollout, OOM, kill) o si el browser se cuelga
 * sin timeout global: nadie vuelve a tocar esa fila. El /automation los
 * muestra eternamente "en ejecución" y confunden el diagnóstico.
 *
 * Regla: un run en `running` con más de BOT_RUN_ORPHAN_MINUTES (default 120)
 * se marca `failed` con intervención requerida y error tipado `orphaned`.
 * Ningún bot legítimo corre 2 horas; el umbral holgado hace imposible el
 * falso positivo durante el solapamiento de un rollout.
 *
 * El estado del TRÁMITE no se toca acá: los workflows tienen su propia
 * recuperación (retry de workerEvents, dead-letter, acciones de /automation).
 * El BotRun es el registro forense — esto solo lo vuelve honesto.
 */

import { PrismaClient } from '../../prisma/generated-client/client';
import type { Logger } from 'pino';

const DEFAULT_THRESHOLD_MINUTES = 120;

export async function runBotRunOrphanSweep(
  prisma: PrismaClient,
  logger: Logger
): Promise<number> {
  // Módulo opcional: si el proyecto no declara la entidad, el modelo no
  // existe en el cliente prisma y este tick es un no-op.
  if (!(prisma as any).botRun) return 0;
  const thresholdMinutes =
    parseInt(process.env.BOT_RUN_ORPHAN_MINUTES || '', 10) || DEFAULT_THRESHOLD_MINUTES;
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);

  const orphans = await prisma.botRun.findMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    select: { id: true, botType: true, startedAt: true, currentPhase: true },
  });
  if (orphans.length === 0) return 0;

  for (const run of orphans) {
    try {
      await prisma.botRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          requiresHumanIntervention: true,
          interventionReason:
            'Proceso huérfano: el worker se reinició o el bot quedó sin respuesta',
          error: {
            errorType: 'orphaned',
            severity: 'critical',
            recoverable: false,
            message:
              `Marcado por el barrido de huérfanos: en ejecución desde ` +
              `${run.startedAt?.toISOString() ?? '?'} sin finalizar ` +
              `(umbral ${thresholdMinutes} min). Última fase: ${run.currentPhase ?? '?'}.`,
            timestamp: new Date().toISOString(),
          } as any,
        },
      });
      logger.warn(
        { botRunId: run.id, botType: run.botType, startedAt: run.startedAt, phase: run.currentPhase },
        '[BotRunOrphanSweep] BotRun huérfano marcado como failed'
      );
    } catch (error) {
      logger.error({ botRunId: run.id, error }, '[BotRunOrphanSweep] No se pudo marcar el huérfano');
    }
  }

  return orphans.length;
}
