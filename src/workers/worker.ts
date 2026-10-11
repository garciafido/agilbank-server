// Load environment variables FIRST
import 'dotenv/config';
import 'reflect-metadata';
import { basePrisma as prisma } from '../prisma/client';
import { pgmq } from '../utils/pgmq';
import { logger } from '../utils/logger';
import { processPipelineJob } from './processors/pipelineProcessor';
import { processBackgroundTask } from './processors/backgroundTaskProcessor';
import { processEmailNotification } from './processors/emailProcessor';
import { processFileDeletion } from './processors/fileDeletionProcessor';
import { processDocumentEmbedding } from './processors/documentEmbeddingProcessor';
import { processEsignatureWebhookInbox } from './processors/esignatureWebhookInboxProcessor';
import { runTokenResetCheck } from './schedulers/tokenResetScheduler';
import { runEmailVerificationExpirationCheck } from './schedulers/emailVerificationExpirationScheduler';
import { runBotRunOrphanSweep } from './schedulers/botRunOrphanSweepScheduler';
import { runAlertSweepCheck } from './schedulers/alertSweepScheduler';
import { runTempSweep } from '../common/storage/tempSweep';
import { registerAlertEvaluators } from '../alerts/registerAlerts';
import { registerProjectSubscribers } from '../services/eventBus/subscribers';
import { startEntityMutationsBridge, stopEntityMutationsBridge } from '../services/eventBus/entityMutationsRedisBridge';
import { redis } from '../services/redis/redisClient';
import { startDevOrphanWatchdog } from '../utils/devOrphanWatchdog';
import * as http from 'http';
import { healthPortFromEnv, listenHealthServer } from './listenHealthServer';
import { container } from 'tsyringe';
import type { MyApolloContext } from '../server';
import { RecoverableBotError } from '../bots/core/types';
import { deadLetterHandlers } from './deadLetterHandlers';
import { retryPolicyRegistry } from '../pipelines/registry';
import { projectSchedulers } from './schedulers/registry';
// Import de EFECTO: acá el proyecto llena los registros opt-in. Sin esta línea
// projectSchedulers y deadLetterHandlers quedan vacíos para siempre, y el punto
// de extensión existe solo en la documentación que lo promete.
import './projectBootstrap';

/**
 * Invoca el handler de dead-letter registrado para el pipeline (opt-in). Permite
 * que la entidad caiga en un failure-state honesto del workflow cuando un job
 * agota reintentos / falla fatal, en vez de quedar atascada en un transitorio.
 * Best-effort: nunca rompe el path de error del worker.
 */
async function fireDeadLetterHandler(payload: any, prismaClient: any, log: any): Promise<void> {
  const handler = payload?.pipelineId ? deadLetterHandlers[payload.pipelineId] : undefined;
  if (!handler) return;
  try {
    await handler({ pipelineId: payload.pipelineId, stageId: payload.stageId, payload, prisma: prismaClient, logger: log });
  } catch (e) {
    log.warn({ pipelineId: payload?.pipelineId, err: e }, 'deadLetterHandler failed');
  }
}
import { notifyDeadLetter } from './notifyDeadLetter';
import { publishStageRetrying, publishStageFailed } from '../pipelines/helpers/progressHelper';

// prisma is already imported from ../prisma/client

/**
 * Entidad afectada por un job de pipeline (para que el cliente recargue su store
 * al recibir el evento SSE). Extracción genérica de las claves de entidad comunes
 * en el payload; si no reconoce ninguna, se omite (el cliente igual ve el mensaje).
 */
function extractAffectedEntity(payload: any): { entityType: string; entityId: string } | undefined {
  const p = payload ?? {};
  const editionId = p.input?.editionId ?? p.payload?.editionId ?? p.input?.payload?.editionId ?? p.editionId;
  if (editionId) return { entityType: 'edition', entityId: editionId };
  const signedEditionId = p.input?.signedEditionId ?? p.payload?.signedEditionId ?? p.input?.payload?.signedEditionId ?? p.signedEditionId;
  if (signedEditionId) return { entityType: 'signedEdition', entityId: signedEditionId };
  return undefined;
}

/** Resuelve el tenant del WorkerEvent del job (igual que notifyDeadLetter). */
async function resolveSseTenantId(payload: any, prismaClient: any): Promise<string | undefined> {
  if (!payload?.workerEventId) return undefined;
  try {
    const we = await prismaClient.workerEvent.findUnique({
      where: { id: payload.workerEventId },
      select: { tenant_id_: true },
    });
    return we?.tenant_id_ ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calculate exponential backoff with jitter for retry delays
 * NOTE: PGMQ set_vt() not available - using delete+resend pattern
 */
function calculateBackoffWithJitter(attempt: number): number {
  const base = 30;  // 30 seconds base
  const exponential = base * Math.pow(2, attempt);
  const jitter = Math.random() * base;  // 0-30s random jitter
  return Math.min(exponential + jitter, 900);  // Max 15 minutes
}

/** Backoff exponencial declarado en `.retryPolicy(backoff = exponential(...))`:
 *  delay = base * factor^(intento-1) (+jitter), topeado en cap. */
function policyBackoffSeconds(
  b: { baseSeconds: number; factor: number; capSeconds: number; jitter: boolean },
  attempt: number
): number {
  const exponential = b.baseSeconds * Math.pow(b.factor, Math.max(0, attempt - 1));
  const jitter = b.jitter ? Math.random() * b.baseSeconds * 0.5 : 0;
  return Math.min(exponential + jitter, b.capSeconds);
}

interface WorkerConfig {
  concurrency: number;
  pollInterval: number;
  visibilityTimeout: number;
}

const config: WorkerConfig = {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
  pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000'),
  // 1800s (30 min): debe superar el runtime máximo realista de un job. Los bots de
  // browser (DNDA: auth ~2.5min con portal lento + 8 fases + reintentos) pueden pasar
  // los 10 min; con un vt bajo, pgmq re-entrega el mensaje y el job corre dos veces.
  // El guard de bot_run no-terminal en processJob es la red de seguridad final.
  visibilityTimeout: parseInt(process.env.WORKER_VISIBILITY_TIMEOUT || '1800'),
};

class Worker {
  private isRunning = false;
  private activeJobs = 0;
  private startTime = Date.now();
  private processedJobs = 0;
  private failedJobs = 0;
  private healthServer: http.Server | null = null;
  private queuesInitialized = false;
  private schedulerInterval: NodeJS.Timeout | null = null;
  /** Timers de los schedulers del proyecto con cadencia propia (everyMs). */
  private projectSchedulerTimers: NodeJS.Timeout[] = [];
  /**
   * Worker events que ESTE proceso está ejecutando. Una redelivery de uno de
   * ellos es un trabajo vivo que superó el visibility-timeout, no un huérfano:
   * el processor lo re-encola en vez de re-tomarlo. Tras un reinicio empieza
   * vacío, así que los huérfanos del proceso anterior se retoman igual.
   */
  private readonly workerEventsEnCurso = new Set<string>();

  // Run scheduled tasks every hour
  private readonly SCHEDULER_INTERVAL = 60 * 60 * 1000; // 1 hour in ms

  async start() {
    this.isRunning = true;
    logger.info({ config }, 'Worker started');

    // El puente al canal de Redis. Sin esto, TODO lo que muta desde un pipeline
    // o un bot publicaba en el bus in-process del worker y moría ahí: ningún
    // otro proceso se enteraba, y las cachés que dependen de esas mutaciones
    // seguían sirviendo lo viejo hasta vencer solas.
    startEntityMutationsBridge();

    // Los suscriptores del proyecto, antes de procesar el primer mensaje. El
    // worker también publica eventos: si solo se registraran en el api, todo
    // lo que muta desde un pipeline pasaría sin que nadie lo escuche.
    registerProjectSubscribers();

    // Initialize queues before starting
    await this.initializeQueues();

    // El puerto de salud, antes de tomar cualquier trabajo: si no se puede
    // abrir, start() rechaza y el worker sale (ver el catch de abajo) sin haber
    // leído ninguna cola ni corrido ninguna tarea periódica. Lo de arriba no
    // toma trabajos: el puente y los suscriptores solo escuchan, y crear las
    // colas es idempotente.
    await this.startHealthServer();

    // Start scheduled tasks (token reset, etc.)
    this.startScheduler();

    // Start polling for each queue
    this.pollQueue('pipeline_jobs', processPipelineJob);
    this.pollQueue('background_tasks', processBackgroundTask);
    this.pollQueue('email_notifications', processEmailNotification);
    this.pollQueue('file_deletions', processFileDeletion);
    this.pollQueue('document_embeddings', processDocumentEmbedding);
    // Inbox durable de webhooks e-signature. Se llena salvo que
    // ESIGNATURE_WEBHOOK_INBOX valga 'inline': sacar este poller deja los
    // eventos de firma encolados sin consumidor.
    this.pollQueue('esignature_webhook_inbox', processEsignatureWebhookInbox);

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  /**
   * Start the internal scheduler for periodic tasks
   * Runs immediately on start, then every SCHEDULER_INTERVAL
   */
  private startScheduler(): void {
    logger.info({ intervalMs: this.SCHEDULER_INTERVAL }, 'Starting internal scheduler');

    // Poblar el registry de tipos de alerta (stub del proyecto; no-op si vacío).
    registerAlertEvaluators();

    // Run immediately on startup
    this.runScheduledTasks();

    // Then run periodically
    this.schedulerInterval = setInterval(() => {
      this.runScheduledTasks();
    }, this.SCHEDULER_INTERVAL);

    this.startProjectSchedulers();
  }

  /**
   * Los schedulers del proyecto que declaran su PROPIA cadencia.
   *
   * El tick general es horario y no sirve para todo: hay trabajo que una
   * persona está esperando —sube algo y quiere verlo salir—, y hacerla esperar
   * hasta cincuenta y ocho minutos sin ninguna señal es una mala respuesta.
   *
   * Cada uno corre en su intervalo y se protege solo: un error se loguea y no
   * corta el timer, y no se solapan consigo mismos —si una vuelta tarda más que
   * el intervalo, la siguiente espera en vez de acumularse—.
   */
  private startProjectSchedulers(): void {
    for (const s of projectSchedulers) {
      if (!s.everyMs) continue;
      logger.info({ scheduler: s.name, everyMs: s.everyMs }, 'Scheduler del proyecto con cadencia propia');
      let corriendo = false;
      const vuelta = async () => {
        if (corriendo) return;
        corriendo = true;
        try {
          await s.run(prisma, logger, redis);
        } catch (error) {
          logger.error({ scheduler: s.name, err: error }, 'Project scheduler failed');
        } finally {
          corriendo = false;
        }
      };
      const timer = setInterval(vuelta, s.everyMs);
      // `unref` para que un timer no impida que el proceso termine cuando se lo
      // manda a parar: el apagado ordenado limpia lo suyo, esto no debe estorbar.
      timer.unref?.();
      this.projectSchedulerTimers.push(timer);
    }
  }

  /**
   * Execute all scheduled tasks
   */
  private async runScheduledTasks(): Promise<void> {
    try {
      // Token reset check (resets monthly counters on configured day)
      await runTokenResetCheck(prisma, logger);

      // Email verification expiration check
      await runEmailVerificationExpirationCheck(prisma, logger, redis);

      // Alert sweep: evalúa AlertRule activas y crea notificaciones (no-op si no hay).
      await runAlertSweepCheck(prisma, logger, redis);

      // Temp sweep: borra temporales huérfanos (descargas de storage, staging
      // de uploads sin Save, restos de bots) según los targets registrados.
      await runTempSweep(logger);

      // BotRuns huérfanos: corridas en "running" abandonadas por reinicios del
      // worker o browsers colgados → failed con intervención requerida.
      await runBotRunOrphanSweep(prisma, logger);

      // Schedulers del PROYECTO (registro opt-in: schedulers/registry.ts).
      // Los que declaran `everyMs` corren en su PROPIO intervalo (ver
      // startProjectSchedulers); acá van solo los del tick general.
      for (const s of projectSchedulers) {
        if (s.everyMs) continue;
        try {
          await s.run(prisma, logger, redis);
        } catch (error) {
          logger.error({ scheduler: s.name, err: error }, 'Project scheduler failed');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error running scheduled tasks');
    }
  }

  private async initializeQueues() {
    const queues = [
      'email_notifications',
      'pipeline_jobs',
      'background_tasks',
      'file_deletions',
      'document_embeddings',
      'esignature_webhook_inbox',
      'email_notifications_dlq',
      'pipeline_jobs_dlq',
      'background_tasks_dlq',
      'file_deletions_dlq',
      'document_embeddings_dlq',
      'esignature_webhook_inbox_dlq'
    ];

    logger.info('Initializing PGMQ queues...');

    for (const queueName of queues) {
      try {
        await pgmq.createQueue(queueName);
        logger.info({ queue: queueName }, 'Queue created successfully');
      } catch (error: any) {
        // Queue might already exist, which is fine
        if (error?.message?.includes('already exists')) {
          logger.debug({ queue: queueName }, 'Queue already exists');
        } else {
          logger.error({ queue: queueName, err: error }, 'Failed to create queue');
          throw error;
        }
      }
    }

    this.queuesInitialized = true;
    logger.info('All queues initialized successfully');
  }

  private async startHealthServer(): Promise<void> {
    // Un valor inválido rechaza acá, antes de tomar trabajo (ver healthPortFromEnv).
    const healthPort = healthPortFromEnv(process.env.WORKER_HEALTH_PORT);

    this.healthServer = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        const health = {
          status: this.isRunning ? 'healthy' : 'shutting-down',
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          activeJobs: this.activeJobs,
          processedJobs: this.processedJobs,
          failedJobs: this.failedJobs,
          queuesInitialized: this.queuesInitialized,
          timestamp: new Date().toISOString()
        };

        // Check database connectivity
        try {
          await prisma.$queryRaw`SELECT 1`;
          health.database = 'connected';
        } catch (error) {
          health.database = 'disconnected';
          health.status = 'unhealthy';
        }

        // Check queues are initialized
        if (!this.queuesInitialized) {
          health.status = 'unhealthy';
          health.queuesStatus = 'not_initialized';
        } else {
          // Test queue connectivity
          try {
            await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'pgmq' AND tablename = 'q_email_notifications')`;
            health.queuesStatus = 'healthy';
          } catch (error) {
            health.queuesStatus = 'error';
            health.status = 'unhealthy';
          }
        }

        res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Abre el puerto o rechaza diciendo por qué (ocupado, sin permiso).
    await listenHealthServer(this.healthServer, healthPort, logger);
  }

  private async pollQueue(queueName: string, processor: Function) {
    while (this.isRunning) {
      try {
        if (this.activeJobs < config.concurrency) {
          const message = await pgmq.read(queueName, config.visibilityTimeout);

          if (message) {
            this.activeJobs++;

            // Process job asynchronously
            this.processJob(queueName, message, processor)
              .finally(() => {
                this.activeJobs--;
              });
          }
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, config.pollInterval));
      } catch (error) {
        logger.error({ queueName, err: error }, 'Error polling queue');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s on error
      }
    }
  }

  private async processJob(queueName: string, message: any, processor: Function) {
    const startTime = Date.now();
    const { msg_id, read_ct, message: payload } = message;

    logger.info({
      queueName,
      msgId: msg_id,
      attempt: read_ct
    }, 'Processing job');

    try {
      // Construir apolloContext desde WorkerEvent si existe workerEventId
      let apolloContext: MyApolloContext | undefined;

      if (payload.workerEventId) {
        // Idempotencia anti-duplicado: si el visibility-timeout de pgmq expira con el
        // job aún corriendo (los bots de browser pueden tardar > vt), pgmq re-entrega
        // el MISMO mensaje (read_ct > 1) y se ejecutaría dos veces EN PARALELO — para
        // un registro externo eso es un trámite duplicado. Si ya existe un bot_run
        // no-terminal para este worker_event, esta es esa re-entrega: descartarla.
        // Proyectos sin bots no declaran BotRun: sin el modelo no hay corridas
        // largas que re-entregar, el chequeo se omite.
        const activeRun = (prisma as any).botRun
          ? await (prisma as any).botRun.findFirst({
              where: {
                workerEvent_id: payload.workerEventId,
                status: { in: ['running', 'requires_intervention'] },
              },
              select: { id: true, status: true },
            })
          : null;
        if (activeRun) {
          logger.warn({
            queueName,
            msgId: msg_id,
            readCt: read_ct,
            workerEventId: payload.workerEventId,
            activeRunId: activeRun.id,
            activeStatus: activeRun.status,
          }, 'Re-entrega de pgmq con bot_run no-terminal activo — descartando para evitar ejecución duplicada');
          await pgmq.delete(queueName, msg_id);
          return;
        }

        const workerEvent = await prisma.workerEvent.findUnique({
          where: { id: payload.workerEventId },
          include: { triggerUserId: { include: { roles: { include: { permissions: true } }, tenant_: true } } }
        });

        if (!workerEvent || !workerEvent.triggerUserId) {
          throw new Error(`WorkerEvent ${payload.workerEventId} not found or missing triggerUser`);
        }

        const requestContainer = container.createChildContainer();

        const user = workerEvent.triggerUserId;

        apolloContext = {
          currentUser: user as any,
          isSystemMode: false,
          hasRole: (role: string) => user?.roles?.some((r: any) => r.name === role) || false,
          permissions: () => {
            if (!user || !user.roles) return new Set<string>();
            const allPermissions = user.roles.flatMap((role: any) =>
              (role.permissions || []).map((p: any) => p.id)
            );
            return new Set<string>(allPermissions);
          },
          prisma: prisma,
          container: requestContainer,
        };
      }

      const workerEventId: string | undefined = payload.workerEventId;
      const enCursoEnEsteProceso = !!workerEventId && this.workerEventsEnCurso.has(workerEventId);
      if (workerEventId && !enCursoEnEsteProceso) this.workerEventsEnCurso.add(workerEventId);
      let result: any;
      try {
        result = await processor(payload, { prisma, logger, apolloContext, enCursoEnEsteProceso });
      } finally {
        if (workerEventId && !enCursoEnEsteProceso) this.workerEventsEnCurso.delete(workerEventId);
      }

      // El processor pide esperar a que venza el evento de otro intento: primero
      // el re-envío y después el borrado, así un corte entre los dos deja un
      // mensaje de más (el claim lo resuelve) y nunca uno de menos.
      if (result?._requeue) {
        await pgmq.send(queueName, { ...payload, _requeues: (payload._requeues ?? 0) + 1 }, { vt: result.delaySeconds });
        await pgmq.delete(queueName, msg_id);
        logger.info({ queueName, msgId: msg_id, delaySeconds: result.delaySeconds }, 'Job re-queued until its worker event expires');
        return;
      }

      // Delete message on success
      await pgmq.delete(queueName, msg_id);

      this.processedJobs++;

      logger.info({
        queueName,
        msgId: msg_id,
        duration: Date.now() - startTime,
      }, 'Job completed');
    } catch (error) {
      this.failedJobs++;

      const currentAttempt = payload._retryAttempt || 1;

      // Política de auto-retry POR PIPELINE (opt-in `.retryPolicy(maxAttempts, backoff)`).
      // - Pipeline "managed" (con maxAttempts): reintenta CUALQUIER fallo hasta N,
      //   salvo los marcados FATALES por el bot (RecoverableBotError.recoverable=false:
      //   deny-list — auth FTP, 404, credenciales inválidas — reintentar es inútil o
      //   peligroso) → directo a dead_letter.
      // - Sin política: comportamiento clásico (solo recoverable=true, 5 intentos).
      const policy = payload?.pipelineId ? retryPolicyRegistry[payload.pipelineId] : undefined;
      const managed = policy?.maxAttempts != null;
      const maxAttempts = managed ? policy.maxAttempts : 5;

      const isRecoverableBotError = error instanceof RecoverableBotError;
      const isFatal = isRecoverableBotError && error.recoverable === false;
      const shouldRetry = managed
        ? !isFatal
        : (isRecoverableBotError ? error.recoverable : false);

      logger.error({
        queueName,
        msgId: msg_id,
        attempt: currentAttempt,
        err: error,
        isRecoverableBotError,
        shouldRetry,
        errorType: isRecoverableBotError ? error.errorType : 'unknown',
      }, 'Job failed');

      await pgmq.delete(queueName, msg_id);

      // SSE: contexto para notificar al cliente. Señal CALMA ("reintentando") si
      // el worker va a reintentar; señal de FALLO DEFINITIVO solo al dead-letter.
      // Centralizado acá — los stages ya NO publican failed por-intento.
      const ssePipeline = !!(payload?.pipelineId && payload?.workerEventId);
      const sseTenantId = ssePipeline ? await resolveSseTenantId(payload, prisma) : undefined;
      const sseAffected = ssePipeline ? extractAffectedEntity(payload) : undefined;

      // Non-recoverable errors go directly to DLQ (no retries)
      if (!shouldRetry) {
        // DLQ + status dead_letter atómicos (misma transacción, mismo Postgres).
        try {
          await prisma.$transaction(async (tx) => {
            await pgmq.send(`${queueName}_dlq`, {
              originalQueue: queueName,
              failedAt: new Date(),
              lastError: error instanceof Error ? error.message : 'Unknown error',
              attempts: currentAttempt,
              errorType: isRecoverableBotError ? error.errorType : 'unknown',
              recoverable: false,
              payload,
            }, undefined, tx);

            if (payload.workerEventId) {
              await tx.workerEvent.update({
                where: { id: payload.workerEventId },
                data: {
                  status: 'dead_letter',
                  retryCount: currentAttempt,
                  nextRetryAt: null,
                },
              });
            }
          });
        } catch (dlqError) {
          logger.error({ workerEventId: payload.workerEventId, queueName, msgId: msg_id, err: dlqError },
            'Failed to move job to DLQ atomically');
        }

        logger.info({
          queueName,
          msgId: msg_id,
          errorType: isRecoverableBotError ? error.errorType : 'unknown',
        }, 'Non-recoverable error - job moved directly to DLQ (no retries)');

        // Notificar a los SysAdmins: punto muerto de un proceso automatizado.
        await notifyDeadLetter(prisma, logger, {
          queueName,
          attempts: currentAttempt,
          recoverable: false,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          payload,
        });

        // Estado honesto: mover la entidad a su failure-state (si el pipeline lo registró).
        await fireDeadLetterHandler(payload, prisma, logger);

        // Fallo DEFINITIVO → notificar al cliente (un único evento, con detalle accionable).
        if (sseTenantId) {
          await publishStageFailed(
            payload.workerEventId, payload.pipelineId, payload.stageId,
            sseTenantId, error, sseAffected
          );
        }

        return;
      }

      // Recoverable errors: check max attempts
      if (currentAttempt >= maxAttempts) {
        // DLQ + status dead_letter atómicos (misma transacción, mismo Postgres).
        try {
          await prisma.$transaction(async (tx) => {
            await pgmq.send(`${queueName}_dlq`, {
              originalQueue: queueName,
              failedAt: new Date(),
              lastError: error instanceof Error ? error.message : 'Unknown error',
              attempts: currentAttempt,
              errorType: isRecoverableBotError ? error.errorType : 'unknown',
              recoverable: true,
              payload,
            }, undefined, tx);

            if (payload.workerEventId) {
              await tx.workerEvent.update({
                where: { id: payload.workerEventId },
                data: {
                  status: 'dead_letter',
                  retryCount: currentAttempt,
                  nextRetryAt: null,
                },
              });
            }
          });
        } catch (dlqError) {
          logger.error({ workerEventId: payload.workerEventId, queueName, msgId: msg_id, err: dlqError },
            'Failed to move job to DLQ atomically');
        }

        logger.info({
          queueName,
          msgId: msg_id,
          attempts: currentAttempt,
        }, 'Job moved to DLQ after max retries');

        // Notificar a los SysAdmins: agotó los reintentos.
        await notifyDeadLetter(prisma, logger, {
          queueName,
          attempts: currentAttempt,
          recoverable: true,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          payload,
        });

        // Estado honesto: mover la entidad a su failure-state (si el pipeline lo registró).
        await fireDeadLetterHandler(payload, prisma, logger);

        // Fallo DEFINITIVO → notificar al cliente (un único evento, con detalle accionable).
        if (sseTenantId) {
          await publishStageFailed(
            payload.workerEventId, payload.pipelineId, payload.stageId,
            sseTenantId, error, sseAffected
          );
        }
      } else {
        // Sim comprimida: bajo sesión de simulación los reintentos no esperan el
        // backoff real (probar la progresión completa sin esperar horas).
        const backoffSeconds = payload?.__simulation
          ? 5
          : (managed && policy.backoff)
            ? policyBackoffSeconds(policy.backoff, currentAttempt)
            : calculateBackoffWithJitter(currentAttempt);

        // Mensaje re-encolado y status del worker_event en UNA transacción:
        // sin esto podía existir mensaje sin evento 'queued' (o viceversa)
        // si el proceso moría entre las dos escrituras.
        try {
          await prisma.$transaction(async (tx) => {
            await pgmq.send(queueName, {
              ...payload,
              _retryAttempt: currentAttempt + 1,
            }, { vt: Math.floor(backoffSeconds) }, tx);

            if (payload.workerEventId) {
              await tx.workerEvent.update({
                where: { id: payload.workerEventId },
                data: {
                  status: 'queued',
                  retryCount: currentAttempt + 1,
                  // Observabilidad: cuándo es el próximo reintento (el delay real vive
                  // en el visibility-timeout de pgmq; acá lo persistimos para la UI).
                  nextRetryAt: new Date(Date.now() + Math.floor(backoffSeconds) * 1000),
                },
              });
            }
          });
        } catch (requeueError) {
          logger.error({ workerEventId: payload.workerEventId, queueName, msgId: msg_id, err: requeueError },
            'Failed to re-queue job atomically — message dropped, worker_event left as-is');
        }

        logger.info({
          queueName,
          msgId: msg_id,
          attempt: currentAttempt,
          nextRetryIn: Math.floor(backoffSeconds),
          errorType: isRecoverableBotError ? error.errorType : 'unknown',
        }, 'Recoverable error - job re-queued with backoff');

        // Señal CALMA al cliente: se está reintentando automáticamente (no es un error final).
        if (sseTenantId) {
          await publishStageRetrying(
            payload.workerEventId, payload.pipelineId, payload.stageId,
            sseTenantId, currentAttempt, maxAttempts, Math.floor(backoffSeconds), sseAffected
          );
        }
      }
    }
  }

  async stop() {
    logger.info('Worker stopping...');
    this.isRunning = false;

    // Forzar cierre si no se cierra después de un tiempo (mismo plazo que el server):
    // sin esto, un job colgado deja al worker esperando en activeJobs para siempre
    setTimeout(() => {
      logger.error('Could not stop worker in time, forcefully shutting down');
      process.exit(1);
    }, 10000);

    stopEntityMutationsBridge();

    // Stop scheduler
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    // Y los del proyecto que corren con cadencia propia.
    for (const t of this.projectSchedulerTimers) clearInterval(t);
    this.projectSchedulerTimers = [];

    // Close health server
    if (this.healthServer) {
      this.healthServer.close();
    }

    // Wait for active jobs to complete
    while (this.activeJobs > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await prisma.$disconnect();
    logger.info('Worker stopped');
    process.exit(0);
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  startDevOrphanWatchdog('worker');
  const worker = new Worker();
  worker.start().catch(error => {
    // Con pino el objeto va primero: el que va después del mensaje se descarta.
    logger.fatal({ err: error }, 'Failed to start worker');
    process.exit(1);
  });
}

export { Worker };
