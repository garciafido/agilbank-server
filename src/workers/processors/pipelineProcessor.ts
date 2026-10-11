import { basePrisma } from '../../prisma/client';
import { SchemaMetadataStore } from '../../common/services/schemaMetadata';
import { pipelineServiceRegistry } from '../../pipelines/registry';
import { SatelliteRegistry } from '../../satellite/services/SatelliteRegistry';
import { evaluateStagePrecondition } from '../stagePreconditions';
import { Counter } from 'prom-client';
import { register as metricsRegister } from '../../metrics/registry';

// Señal de fencing: cuántos jobs se descartaron porque la entidad avanzó de
// estado (reintentos tardíos, redeliveries). Ocurrencias legítimas aisladas;
// un burst sostenido = algo re-encola de más.
const workerJobsSupersededTotal = new Counter({
  name: 'worker_jobs_superseded_total',
  help: 'Pipeline jobs descartados como superseded (la entidad avanzó de estado)',
  labelNames: ['pipeline'] as const,
  registers: [metricsRegister],
});
import type { ISatelliteRegistry } from '../../satellite/types';
import type { Logger } from 'pino';
import type { MyApolloContext } from '../../server';
import type { ProxyConfig, RegionConfig } from '../../pipelines/pipeline/types';

// Ventana tras la cual un worker_event 'processing' se considera abandonado
// (proceso muerto sin actualizar status) y puede ser re-claimeado por una
// redelivery. Alineado con el visibility-timeout del worker.
const STALE_PROCESSING_MS = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT || '1800', 10) * 1000;
// Tope de re-encolados de un mismo mensaje mientras su evento sigue en proceso:
// un evento que no vence nunca (reloj corrido) no puede ciclar para siempre.
const MAX_REQUEUES = 3;

interface PipelineJobPayload {
  pipelineId: string;
  stageId: string;
  input: any;
  timestamp: Date;
  workerEventId?: string;
  proxyConfig?: ProxyConfig;    // Configuración de proxy desde el DSL
  regionConfig?: RegionConfig;  // Configuración de región desde el DSL
  __simulation?: { sessionId: string; mode: 'auto' | 'manual' };  // run simulado (infra de simulación)
  _requeues?: number;           // veces que se re-encoló esperando que venza su evento
}

interface ProcessorContext {
  prisma: typeof basePrisma;
  logger: Logger;
  apolloContext?: MyApolloContext;
  /** El worker ya está ejecutando este worker event en este mismo proceso. */
  enCursoEnEsteProceso?: boolean;
}

/**
 * Helper para capitalizar primera letra
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Singleton de SchemaMetadataStore para reutilizar en todos los jobs
 */
let schemaMetaStoreInstance: SchemaMetadataStore | null = null;
function getSchemaMetaStore(): SchemaMetadataStore {
  if (!schemaMetaStoreInstance) {
    schemaMetaStoreInstance = new SchemaMetadataStore();
    schemaMetaStoreInstance.build();
  }
  return schemaMetaStoreInstance;
}

/**
 * Singleton de SatelliteRegistry para bots que necesitan proxy.
 * Creado lazy cuando se necesita, requiere prisma y logger.
 */
let satelliteRegistryInstance: ISatelliteRegistry | null = null;
function getSatelliteRegistry(
  prisma: typeof basePrisma,
  logger: Logger
): ISatelliteRegistry {
  if (!satelliteRegistryInstance) {
    satelliteRegistryInstance = new SatelliteRegistry(prisma as any, logger);
  }
  return satelliteRegistryInstance;
}

export async function processPipelineJob(
  payload: PipelineJobPayload,
  context: ProcessorContext
): Promise<any> {
  const { pipelineId, stageId, input, workerEventId, proxyConfig, regionConfig, __simulation } = payload;
  const { prisma, logger, apolloContext } = context;
  const startTime = Date.now();

  if (!apolloContext) {
    throw new Error('apolloContext is required for pipeline jobs');
  }

  logger.info({ pipelineId, stageId, workerEventId }, 'Processing pipeline job');

  try {
    // 1. CLAIM condicional del WorkerEvent (fencing). Solo un intento vivo puede
    // procesar el evento: se toma si está 'queued' (camino normal), 'failed'
    // (crash entre el fallo del stage y el re-encolado del worker) o
    // 'processing' abandonado (proceso muerto; redelivery por visibility-timeout).
    // Un evento 'completed' / 'dead_letter' / 'superseded' NO se reprocesa: el
    // mensaje se descarta sin reintentos ni dead-letter (superseded no es un
    // fallo). Uno 'processing' que no se puede tomar vuelve a la cola.
    if (workerEventId) {
      const now = new Date();
      // Un evento que este proceso sigue ejecutando no se re-toma aunque haya
      // vencido: es un trabajo vivo más largo que el visibility-timeout.
      const claimed = context.enCursoEnEsteProceso ? { count: 0 } : await prisma.workerEvent.updateMany({
        where: {
          id: workerEventId,
          OR: [
            { status: 'queued' },
            { status: 'failed' },
            { status: 'processing', startedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
          ],
        },
        data: {
          status: 'processing',
          startedAt: now,
        },
      });

      if (claimed.count === 0) {
        // 'processing' sin vencer no es terminal: la redelivery llega a los
        // `vt` de la LECTURA y el evento vence a STALE_PROCESSING_MS de la
        // TOMA, unos segundos después. Descartarlo perdía para siempre el
        // trabajo de un worker que murió; se lo devuelve a la cola para
        // cuando venza, y ahí lo toma el claim de arriba o resulta terminal.
        const evento = await prisma.workerEvent.findUnique({
          where: { id: workerEventId },
          select: { status: true, startedAt: true },
        });
        const reencolados = payload._requeues ?? 0;
        if (evento?.status === 'processing' && evento.startedAt && reencolados < MAX_REQUEUES) {
          const venceEnMs = evento.startedAt.getTime() + STALE_PROCESSING_MS - now.getTime();
          const delaySeconds = Math.max(60, Math.ceil(venceEnMs / 1000) + 60);
          logger.warn(
            { pipelineId, stageId, workerEventId, delaySeconds, reencolados },
            'WorkerEvent en proceso — mensaje re-encolado'
          );
          return { _requeue: true, delaySeconds };
        }
        logger.warn(
          { pipelineId, stageId, workerEventId },
          'WorkerEvent no claimeable (terminal o en proceso por otro intento) — mensaje descartado como superseded'
        );
        workerJobsSupersededTotal.inc({ pipeline: pipelineId });
        return { _superseded: true, reason: 'worker_event_not_claimable' };
      }
    }

    // 1b. Precondición de stage (opt-in por pipeline): re-valida que la entidad
    // siga en el estado que el stage espera ANTES de cualquier side effect.
    // Cubre reintentos tardíos, redeliveries y retries manuales por igual.
    const precondition = await evaluateStagePrecondition({
      pipelineId,
      stageId,
      payload,
      prisma: prisma as any,
      logger,
    });

    if (!precondition.ok) {
      logger.warn(
        { pipelineId, stageId, workerEventId, reason: precondition.reason },
        'Precondición de stage no cumplida — job superseded (la entidad avanzó de estado)'
      );
      workerJobsSupersededTotal.inc({ pipeline: pipelineId });

      if (workerEventId) {
        await prisma.workerEvent.update({
          where: { id: workerEventId },
          data: {
            status: 'superseded',
            completedAt: new Date(),
            error: { message: `superseded: ${precondition.reason}` },
            duration: Date.now() - startTime,
          },
        });
      }

      return { _superseded: true, reason: precondition.reason };
    }

    // 2. Get pipeline service from static registry (avoids dynamic imports that esbuild can't resolve)
    const ServiceClass = pipelineServiceRegistry[pipelineId];

    if (!ServiceClass) {
      const availablePipelines = Object.keys(pipelineServiceRegistry).join(', ');
      throw new Error(
        `Pipeline service not found in registry: ${pipelineId}. ` +
        `Available pipelines: ${availablePipelines}`
      );
    }

    // 3. Create service instance manualmente (worker no tiene DI container)
    const schemaMetaStore = getSchemaMetaStore();
    const service = new ServiceClass(prisma, schemaMetaStore);

    // 4. Buscar método execute{StageId} con capitalización correcta
    const methodName = `execute${capitalize(stageId)}`;
    const stageMethod = service[methodName];

    if (!stageMethod || typeof stageMethod !== 'function') {
      throw new Error(`Stage method not found: ${methodName} in pipeline ${pipelineId}`);
    }

    logger.info({ pipelineId, stageId, methodName, hasProxyConfig: !!proxyConfig, hasRegionConfig: !!regionConfig }, 'Executing stage method');

    // 5. Preparar input con satelliteRegistry, proxyConfig y regionConfig si el stage lo necesita
    const needsSatellite = proxyConfig || regionConfig;
    const satelliteRegistry = needsSatellite ? getSatelliteRegistry(prisma, logger) : undefined;

    // 5b. Simulación: si el run es simulado, armar ctx.simulation (gate suspend/resume).
    // Inerte si no hay __simulation → el stage corre real.
    let simulation: import('../simulation/types').SimulationContext | undefined;
    if (__simulation) {
      const session = await prisma.simulationSession.findUnique({ where: { id: __simulation.sessionId } });
      if (session) {
        const { buildSimulationContext } = await import('../simulation/gate');
        const { publishSimulationEvent } = await import('../../pipelines/helpers/progressHelper');
        simulation = buildSimulationContext({
          sessionId: session.id,
          tenantId: (session as any).tenant_id_,
          mode: __simulation.mode,
          scenario: ((session as any).scenario as any) ?? {},
          resolvedGates: ((session as any).resolvedGates as any) ?? {},
          prisma,
          workerEventId,
          onWaiting: (gate: string, label?: string) =>
            publishSimulationEvent({ sessionId: session.id, tenantId: (session as any).tenant_id_, type: 'waiting', gate, label }),
        });
      }
    }

    const stageInput = {
      ...input,
      // El execute{Stage} generado declara `workerEventId` en su input; el processor
      // lo recibe a nivel mensaje y debe pasarlo al stage (sin esto el bot corre con
      // workerEventId undefined → BotRun no linkeado y el gate de sim no puede suspender).
      ...(workerEventId && { workerEventId }),
      ...(satelliteRegistry && { satelliteRegistry }),
      ...(proxyConfig && { proxyConfig }),
      ...(regionConfig && { regionConfig }),
      ...(simulation && { simulation }),
    };

    // 6. Ejecutar stage con apolloContext completo
    const result = await stageMethod.call(service, stageInput, apolloContext);

    // 6. Actualizar WorkerEvent a 'completed'
    if (workerEventId) {
      await prisma.workerEvent.update({
        where: { id: workerEventId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result,
          duration: Date.now() - startTime
        }
      });
    }

    logger.info({
      pipelineId,
      stageId,
      duration: Date.now() - startTime,
      resultKeys: result ? Object.keys(result) : []
    }, 'Pipeline stage completed');

    // 7. Si hay stages dependientes, encolarlos
    if (result && result._nextStages) {
      const { pgmq } = await import('../../utils/pgmq');

      for (const nextStage of result._nextStages) {
        await pgmq.send('pipeline_jobs', {
          pipelineId,
          stageId: nextStage.stageId,
          input: nextStage.input || result,
          timestamp: new Date(),
          ...(__simulation && { __simulation }),  // propagar simulación al siguiente stage
        });

        logger.info({
          pipelineId,
          nextStageId: nextStage.stageId,
        }, 'Enqueued next stage');
      }
    }

    return result;
  } catch (error) {
    // Suspensión de simulación: NO es fallo. El WorkerEvent ya quedó 'waiting';
    // no marcar failed ni reintentar. Retorno normal → el worker hace delete del mensaje.
    const { SimulationSuspend } = await import('../simulation/types');
    if (error instanceof SimulationSuspend) {
      logger.info({ sessionId: error.sessionId, gate: error.gate, workerEventId }, 'Simulation suspended at gate');
      return { _suspended: true };
    }

    // 8. Actualizar WorkerEvent a 'failed'
    if (workerEventId) {
      try {
        await prisma.workerEvent.update({
          where: { id: workerEventId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            error: {
              message: error.message || String(error),
              stack: error.stack
            },
            duration: Date.now() - startTime
          }
        });
      } catch (updateError) {
        logger.error({ err: updateError }, 'Failed to update WorkerEvent after error');
      }
    }

    logger.error({
      pipelineId,
      stageId,
      workerEventId,
      error: error.message,
      stack: error.stack,
    }, 'Pipeline job failed');

    throw error;
  }
}
