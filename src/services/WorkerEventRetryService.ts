import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'crypto';
import { ServiceContext } from '../service-context';
import { enqueuePipelineJob } from '../utils/pgmq';
import { retryPolicyRegistry } from '../pipelines/registry';
import { logger } from '../utils/logger';

type RetryMode = 'fresh' | 'stored';

interface RetryPolicy {
  modes: RetryMode[];
  retryableStates: string[];
  maxManualRetries: number;
  editableFields: string[];
  orphanTimeoutSeconds?: number;
  requiresPermission?: string;
}

// Estados de BotRun (no de WorkerEvent) que también habilitan el reintento.
const RETRYABLE_BOTRUN_STATES = ['requires_intervention'];

export interface RetryInfo {
  canRetry: boolean;
  reason?: string;
  modes: RetryMode[];
  editableFields: string[];
  currentValues: Record<string, unknown>;
}

export interface RetryResult {
  newWorkerEventId: string;
}

/**
 * Servicio genérico de reintento manual de pipeline jobs (WorkerEvent).
 *
 * MVP: solo modo `stored` (re-encola el payload guardado + overrides acotados a editableFields).
 * El opt-in es por pipeline vía `.retryPolicy` (retryPolicyRegistry). Un pipeline sin política no
 * es reintentable. Permiso por defecto: `${pipelineId_lowered}_retry` (override en la política).
 *
 * Control de acceso EXPLÍCITO (convención WorkerEvent, igual que sadaicFtpUploadService /
 * BotNotificationService): no usa SecurePrismaOps. Permiso vía chequeo explícito de la permission
 * de retry; multitenancy vía guard explícito (tenant_id_) en lectura y tenant_ explícito en
 * escritura; audit fields seteados a mano. Esto preserva la granularidad del permiso de retry
 * (un rol con solo `${pipeline}_retry` puede reintentar sin necesitar workerEvent_create).
 */
@injectable()
export class WorkerEventRetryService {
  constructor(@inject('ServiceContext') private context: ServiceContext) {}

  private parseJobType(jobType: string): { pipelineId: string; stageId: string } {
    const [pipelineId, stageId] = jobType.split('.');
    return { pipelineId, stageId };
  }

  private policyFor(pipelineId: string): RetryPolicy | undefined {
    return retryPolicyRegistry[pipelineId] as RetryPolicy | undefined;
  }

  private requiredPermission(pipelineId: string, policy: RetryPolicy): string {
    const lowered = pipelineId.charAt(0).toLowerCase() + pipelineId.slice(1);
    return policy.requiresPermission ?? `${lowered}_retry`;
  }

  /**
   * Lee el WorkerEvent de la empresa de quien pide. Un evento de otra empresa es
   * indistinguible de uno que no existe.
   *
   * El filtro va en el WHERE, no después. La versión anterior leía sin filtrar y
   * comparaba al final:
   *
   *     if (currentTenant && ev.tenant_id_ && ev.tenant_id_ !== currentTenant) return null;
   *
   * Eso falla ABIERTO: si `currentTenant` es undefined —un usuario sin empresa— la
   * comparación se saltea y el evento se devuelve. Y de ahí sale el reintento, que
   * reencola el input del stage sin volver a pasar por el resolver. `tenant_id_` es
   * no nulable en el modelo, así que la única rama que abría era la del usuario sin
   * empresa; el comentario, en cambio, afirmaba que el bloqueo era explícito.
   *
   * Sin empresa se CORTA. No se degrada a «sin condición»: `undefined` en un `where`
   * de Prisma no filtra, omite la condición, y eso convertiría el corte en una
   * consulta global.
   */
  private async loadEvent(workerEventId: string): Promise<any | null> {
    const currentTenant = this.context.currentUser?.tenant_id_;
    if (!currentTenant) return null;

    const ev = await this.context.prisma.workerEvent.findFirst({
      where: { id: workerEventId, tenant_id_: currentTenant },
      include: { BotRun_workerEvent: { select: { status: true } } },
    });
    return ev ?? null;
  }

  private stagePayload(ev: any): {
    inner: Record<string, unknown>;
    pipelineId: string;
    stageId: string;
    regionConfig?: unknown;
    proxyConfig?: unknown;
  } {
    const stored = (ev.payload ?? {}) as {
      payload?: unknown;
      pipelineId?: string;
      stageId?: string;
      regionConfig?: unknown;
      proxyConfig?: unknown;
    };
    const fromJobType = this.parseJobType(ev.jobType);
    return {
      inner: (stored.payload ?? {}) as Record<string, unknown>,
      pipelineId: stored.pipelineId ?? fromJobType.pipelineId,
      stageId: stored.stageId ?? fromJobType.stageId,
      // Preservar config de región/proxy del enqueue original: el bot DNDA usa
      // .region("ar") y se persiste en payload.regionConfig; sin esto un retry
      // correría sin proxy/región.
      regionConfig: stored.regionConfig,
      proxyConfig: stored.proxyConfig,
    };
  }

  private isRetryableState(ev: any, policy: RetryPolicy): boolean {
    if (policy.retryableStates.includes(ev.status)) return true;
    const botRunStatuses: string[] = (ev.BotRun_workerEvent ?? []).map((b: any) => b.status);
    return botRunStatuses.some((s) => RETRYABLE_BOTRUN_STATES.includes(s));
  }

  async getRetryInfo(workerEventId: string): Promise<RetryInfo> {
    const empty = { modes: [] as RetryMode[], editableFields: [] as string[], currentValues: {} };
    const ev = await this.loadEvent(workerEventId);
    if (!ev) return { canRetry: false, reason: 'not_found', ...empty };

    const { pipelineId, inner } = this.stagePayload(ev);
    const policy = this.policyFor(pipelineId);
    if (!policy) return { canRetry: false, reason: 'not_retryable', ...empty };

    const base = { modes: policy.modes, editableFields: policy.editableFields, currentValues: {} as Record<string, unknown> };

    if (!this.context.permissions().has(this.requiredPermission(pipelineId, policy)))
      return { canRetry: false, reason: 'forbidden', ...base };

    if (!this.isRetryableState(ev, policy))
      return { canRetry: false, reason: 'state_not_retryable', ...base };

    if ((ev.manualRetryCount ?? 0) >= policy.maxManualRetries)
      return { canRetry: false, reason: 'max_retries', ...base };

    const currentValues: Record<string, unknown> = {};
    for (const f of policy.editableFields) currentValues[f] = inner[f];

    return { canRetry: true, modes: policy.modes, editableFields: policy.editableFields, currentValues };
  }

  async retry(workerEventId: string, mode?: RetryMode, overrides?: Record<string, unknown>): Promise<RetryResult> {
    const ev = await this.loadEvent(workerEventId);
    if (!ev) throw new Error('WorkerEvent not found');

    const { pipelineId, stageId, inner, regionConfig, proxyConfig } = this.stagePayload(ev);
    const policy = this.policyFor(pipelineId);
    if (!policy) throw new Error('Pipeline not retryable');

    const user = this.context.currentUser;
    if (!user) throw new Error('Forbidden: no current user');
    if (!this.context.permissions().has(this.requiredPermission(pipelineId, policy)))
      throw new Error('Forbidden: missing retry permission');

    const chosenMode: RetryMode = mode ?? policy.modes[0] ?? 'stored';
    if (!policy.modes.includes(chosenMode)) throw new Error(`Mode not allowed: ${chosenMode}`);
    if (chosenMode !== 'stored') throw new Error("Only 'stored' mode is implemented in this build");

    if (!this.isRetryableState(ev, policy)) throw new Error('WorkerEvent state is not retryable');
    if ((ev.manualRetryCount ?? 0) >= policy.maxManualRetries) throw new Error('Max manual retries reached');

    // Overrides acotados a editableFields → se aplican sobre el input del stage.
    const newInner: Record<string, unknown> = { ...inner };
    for (const [k, v] of Object.entries(overrides ?? {})) {
      if (!policy.editableFields.includes(k)) throw new Error(`Field not editable: ${k}`);
      newInner[k] = v;
    }

    // Fencing del retry manual: misma precondición que evalúa el worker en cada
    // intento. Si la entidad ya avanzó de estado, rechazar acá con un mensaje
    // claro en vez de encolar un job que el worker descartaría como superseded.
    const { evaluateStagePrecondition } = await import('../workers/stagePreconditions');
    const precondition = await evaluateStagePrecondition({
      pipelineId,
      stageId,
      payload: { pipelineId, stageId, input: newInner, timestamp: new Date() },
      prisma: this.context.prisma as any,
      logger: logger as any,
    });
    if (!precondition.ok) {
      throw new Error(`No se puede reintentar: ${precondition.reason}`);
    }

    // Todo en UNA transacción (incluida la publicación pgmq, que vive en el
    // mismo Postgres): el mensaje, el worker_event nuevo y el supersede del
    // viejo se vuelven visibles atómicamente. Sin esto el worker podía leer
    // el mensaje antes del commit del worker_event ("WorkerEvent not found").
    const newEvent = await this.context.prisma.$transaction(async (tx) => {
      const created = await tx.workerEvent.create({
        data: {
          queueName: ev.queueName,
          jobType: ev.jobType,
          status: 'queued',
          enqueuedAt: new Date(),
          payload: {
            payload: newInner,
            pipelineId,
            stageId,
            ...(regionConfig != null ? { regionConfig } : {}),
            ...(proxyConfig != null ? { proxyConfig } : {}),
          },
          result: { progress: 0, total: 0, current: 0 },
          retryCount: 0,
          manualRetryCount: (ev.manualRetryCount ?? 0) + 1,
          correlationId: ev.correlationId,
          version_: randomUUID(),
          createdAt_: new Date(),
          triggerUserId: { connect: { id: user.id } },
          createdBy_: { connect: { id: user.id } },
          ...(user.tenant_id_ && { tenant_: { connect: { id: user.tenant_id_ } } }),
        },
      });

      await enqueuePipelineJob(
        pipelineId,
        stageId,
        {
          payload: newInner,
          workerEventId: created.id,
          ...(regionConfig != null ? { regionConfig } : {}),
          ...(proxyConfig != null ? { proxyConfig } : {}),
        },
        undefined,
        tx,
      );

      await tx.workerEvent.update({
        where: { id: ev.id },
        data: { status: 'superseded' },
      });

      return created;
    });

    logger.info(
      {
        action: 'manual_retry',
        originalWorkerEventId: ev.id,
        newWorkerEventId: newEvent.id,
        pipelineId,
        stageId,
        mode: chosenMode,
        manualRetryCount: (ev.manualRetryCount ?? 0) + 1,
        overrideKeys: Object.keys(overrides ?? {}),
        byUserId: user.id,
        tenantId: user.tenant_id_,
      },
      'WorkerEvent manual retry re-enqueued',
    );

    return { newWorkerEventId: newEvent.id };
  }
}
