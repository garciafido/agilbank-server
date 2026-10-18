import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'crypto';
import { ServiceContext } from '../service-context';
import { enqueuePipelineJob } from '../utils/pgmq';
import { generatedSchemaMetadata } from '../common/services/schemaMetadata.generated';

type ControlAction = 'advance' | 'fail' | 'succeed' | 'abort';
type SimulationFault = 'recoverable' | 'intervention';
type SimulationMode = 'auto' | 'manual';

export interface ControlResult {
  ok: boolean;
}

export interface StartResult {
  sessionId: string;
}

/** Allowlist de tenants habilitados para simulación (env SIMULATION_TENANTS).
 *  Tolerante a notación con corchetes/comillas: `AGILMIND,OTRO` == `["AGILMIND","OTRO"]`. */
export function simulationTenants(): string[] {
  return (process.env.SIMULATION_TENANTS ?? '')
    .replace(/[\[\]"']/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SimulationLauncher = (a: {
  relatedEntityId: string;
  tenantId: string;
  userId: string;
  prisma: any;
  context: ServiceContext;
}) => Promise<void>;

/**
 * Registro opt-in de "circuit launchers" por relatedEntityType. Vacío por default
 * (inerte). El proyecto registra el suyo (p.ej. 'SignedEdition') para que `start()`
 * dispare el circuito real tras crear la sesión. Mantiene el servicio genérico sin
 * acoplarse al dominio del proyecto.
 */
export const simulationLaunchers: Record<string, SimulationLauncher> = {};

export type SimulationResetter = (a: {
  relatedEntityId: string;
  tenantId: string;
  prisma: any;
  context: ServiceContext;
}) => Promise<void>;

/**
 * Registro opt-in de "resetters" por relatedEntityType (inerte por default).
 * `reset()` aborta las sesiones activas de la entidad e invoca el resetter del
 * proyecto, que devuelve la entidad a su estado inicial de circuito (estados de
 * workflow + campos derivados) para poder re-simular desde cero.
 */
export const simulationResetters: Record<string, SimulationResetter> = {};

/**
 * Servicio genérico de simulaciones: `start()` (crea sesión anclada a entidad y,
 * si el proyecto registró un launcher para ese relatedEntityType, dispara el
 * circuito real), `control()` (resume/abort de un gate) y `getSession()`
 * (observabilidad). La simulación se activa porque existe la sesión (los bot-stages
 * la resuelven por entidad).
 *
 * Control de acceso EXPLÍCITO (igual que WorkerEventRetryService): permiso
 * `simulation_run` + filtro por tenant (allowlist en prod vía SIMULATION_TENANTS).
 */
@injectable()
export class SimulationService {
  constructor(@inject('ServiceContext') private context: ServiceContext) {}

  private assertAllowed(tenantId: string): void {
    const user = this.context.currentUser;
    if (!user) throw new Error('Forbidden: no current user');
    if (!this.context.permissions().has('simulation_run')) {
      throw new Error('Forbidden: missing simulation_run permission');
    }
    // El allowlist manda en producción SIEMPRE, y fuera de producción cuando la
    // variable está DECLARADA — declarada y vacía incluida, porque vaciarla es el
    // gesto documentado para apagar la simulación, y antes ese gesto no tenía efecto
    // fuera de producción. Sin la variable no se restringe: es lo que hace usable un
    // entorno de desarrollo.
    const isProd = process.env.NODE_ENV === 'production';
    const declared = process.env.SIMULATION_TENANTS !== undefined;
    const allowlist = simulationTenants();
    if (isProd || declared) {
      if (!allowlist.includes(tenantId)) {
        throw new Error(
          `Simulation not allowed for tenant ${tenantId} in this environment (SIMULATION_TENANTS)`,
        );
      }
    }
  }

  /**
   * La entidad que se simula o resetea tiene que ser de la empresa de quien pide.
   *
   * Es el gate que le faltaba a la clase: `relatedEntityId` llega crudo desde la
   * mutation y se le entrega al launcher/resetter que registra el proyecto, que
   * escribe por ese id — sin este chequeo, un operador con `simulation_run` dispara
   * el circuito real o el reset destructivo sobre la entidad de otra empresa.
   * Acotar solo las consultas del propio servicio no alcanza: lo que escribe es el
   * código del proyecto, y recibe el id ya resuelto.
   *
   * El escape es el privilegio cross-tenant declarado sobre la ENTIDAD DESTINO (no
   * sobre SimulationSession): quien puede administrar esa entidad a través de las
   * empresas puede simularla. Se mira el rol y no el modo `onRequest`, porque acá no
   * hay un listado que pueda mezclar empresas sin querer: la operación nombra un id
   * concreto, así que el cruce ya es explícito en el pedido mismo.
   */
  private async resolveSimulatedEntityTenant(
    relatedEntityType: string,
    relatedEntityId: string,
    tenantId: string,
  ): Promise<string> {
    const meta = generatedSchemaMetadata.get(relatedEntityType as any) as any;
    // Tipo desconocido: cortar. Un launcher/resetter registrado para algo que el
    // schema no declara no puede verificarse, y no verificable es no permitido.
    if (!meta) throw new Error(`Unknown entity type for simulation: ${relatedEntityType}`);

    // Entidad sin empresa (.sharedAcrossTenants): no hay pertenencia que verificar,
    // y la sesión se ancla a la empresa de quien pide.
    const tenantField = meta.tenantIdField;
    if (!tenantField) return tenantId;

    const ct = meta.crossTenantForRoles;
    const rol = this.context.currentUser?.role?.id;
    const crossesTenants = !!ct && !!rol && ct.roles.includes(rol);

    const delegate = relatedEntityType.charAt(0).toLowerCase() + relatedEntityType.slice(1);
    const row = await (this.context.prisma as any)[delegate]?.findFirst({
      where: crossesTenants ? { id: relatedEntityId } : { id: relatedEntityId, [tenantField]: tenantId },
      select: { id: true, [tenantField]: true },
    });
    // Una entidad de otra empresa es indistinguible de una que no existe.
    if (!row) throw new Error(`${relatedEntityType} ${relatedEntityId} not found`);

    // La empresa EFECTIVA es la de la entidad simulada, no la de quien pide: con el
    // privilegio cross-tenant las dos difieren, y todo lo que cuelga de la simulación
    // (la sesión, el abort del reset) tiene que colgar de la entidad, o queda partido
    // entre dos empresas.
    return row[tenantField] ?? tenantId;
  }

  /**
   * Crea una SimulationSession anclada a una entidad (entity-anchored). NO lanza
   * el circuito: éste se dispara por el medio normal del proyecto y la simulación
   * se activa porque existe la sesión (los bot-stages la resuelven por entidad).
   */
  async start(args: {
    relatedEntityType: string;
    relatedEntityId: string;
    mode: SimulationMode;
    scenario?: any;
    label?: string;
  }): Promise<StartResult> {
    const user = this.context.currentUser;
    if (!user) throw new Error('Forbidden: no current user');
    const tenantId = user.tenant_id_;
    // Mismo corte que reset(): sin empresa se corta. Con el `?? ''` de antes, la
    // ausencia se convertía en "empresa vacía" y el connect condicional dejaba una
    // sesión sin empresa, invisible después para getSession y para el propio dueño.
    if (!tenantId) throw new Error('Forbidden: user has no tenant');
    this.assertAllowed(tenantId);
    const entityTenantId = await this.resolveSimulatedEntityTenant(
      args.relatedEntityType, args.relatedEntityId, tenantId,
    );

    const session = await this.context.prisma.simulationSession.create({
      data: {
        status: 'running',
        mode: args.mode,
        label: args.label ?? null,
        // entity-anchored: no hay un único pipeline de entrada; guardamos el tipo
        // de entidad como descriptor para el displayId/listado.
        entryPipeline: args.relatedEntityType,
        scenario: args.scenario ?? {},
        resolvedGates: {},
        relatedEntityType: args.relatedEntityType,
        relatedEntityId: args.relatedEntityId,
        correlationId: randomUUID(),
        startedAt: new Date(),
        version_: randomUUID(),
        createdAt_: new Date(),
        triggeredBy: { connect: { id: user.id } },
        createdBy_: { connect: { id: user.id } },
        tenant_: { connect: { id: entityTenantId } },
      } as any,
    });

    // Lanzar el circuito real vía el launcher opt-in del proyecto (si registrado).
    // Se hace DESPUÉS de crear la sesión para que los bot-stages la resuelvan por
    // entidad. Si el launcher falla, rollback de la sesión (no dejar huérfanas).
    const launch = simulationLaunchers[args.relatedEntityType];
    if (launch) {
      try {
        await launch({
          relatedEntityId: args.relatedEntityId,
          tenantId: entityTenantId,
          userId: user.id,
          prisma: this.context.prisma,
          context: this.context,
        });
      } catch (e) {
        await this.context.prisma.simulationSession
          .delete({ where: { id: session.id } })
          .catch(() => {});
        throw e;
      }
    }

    return { sessionId: session.id };
  }

  /** ¿El usuario tiene privilegio cross-tenant sobre SimulationSession
   *  (crossTenantForRoles en la metadata del schema)?
   *
   *  Mira el rol y no el `mode`, a diferencia de SecurePrismaOps, que en modo
   *  `onRequest` exige un `forAllTenants()` explícito. La diferencia es deliberada y
   *  se apoya en qué protege cada uno: allá el modo evita que un LISTADO mezcle
   *  empresas sin que nadie lo haya pedido; acá cada operación nombra un sessionId
   *  concreto, así que el cruce ya es explícito en el pedido. Si algún día estas
   *  mutations aceptan un argumento de cruce, este predicado debería exigirlo. */
  private hasCrossTenantPrivilege(): boolean {
    const ct = (generatedSchemaMetadata.get('SimulationSession' as any) as any)
      ?.crossTenantForRoles;
    if (!ct) return false;
    const rol = this.context.currentUser?.role?.id;
    return !!rol && ct.roles.includes(rol);
  }

  /**
   * La sesión de la empresa de quien pide, o de cualquiera si tiene el privilegio
   * cross-tenant declarado en el DSL. Una sesión ajena es indistinguible de una que
   * no existe.
   *
   * La versión anterior leía sin filtrar y comparaba al final:
   *
   *     if (currentTenant && s.tenant_id_ && s.tenant_id_ !== currentTenant && !priv)
   *
   * Falla ABIERTO en las dos primeras condiciones: sin `currentTenant` —un usuario sin
   * empresa— la comparación se saltea y la sesión se devuelve, sin necesitar el
   * privilegio. El privilegio sigue siendo la única vía cross-tenant, pero ahora hay
   * que tenerlo.
   */
  async getSession(id: string): Promise<any | null> {
    const currentTenant = this.context.currentUser?.tenant_id_;
    const cruzaEmpresas = this.hasCrossTenantPrivilege();
    // Sin empresa y sin privilegio se corta antes de consultar: `undefined` en un
    // `where` de Prisma no filtra, omite la condición.
    if (!currentTenant && !cruzaEmpresas) return null;

    const s = await this.context.prisma.simulationSession.findFirst({
      where: {
        id,
        ...(cruzaEmpresas ? {} : { tenant_id_: currentTenant }),
      },
    });
    return s ?? null;
  }

  /**
   * Reset de la entidad al estado inicial del circuito (testing): aborta las
   * sesiones de simulación activas de la entidad e invoca el resetter registrado
   * por el proyecto (estados de workflow + campos derivados). Gateado igual que
   * start/control (permiso simulation_run + tenant allowlist).
   */
  async reset(args: {
    relatedEntityType: string;
    relatedEntityId: string;
  }): Promise<{ ok: boolean }> {
    const user = this.context.currentUser;
    if (!user) throw new Error('Forbidden: no current user');
    const tenantId = user.tenant_id_;
    // Sin empresa se corta: el reset escribe (aborta sesiones y llama al resetter del
    // proyecto), y `tenant_id_: undefined` en un where de Prisma OMITE la condición,
    // que acá significaría abortar las sesiones de todas las empresas.
    if (!tenantId) throw new Error('Forbidden: user has no tenant');
    this.assertAllowed(tenantId);
    // Antes del resetter: el resetter del proyecto escribe por `relatedEntityId` (en
    // general sin volver a mirar la empresa), así que la pertenencia se verifica acá.
    const entityTenantId = await this.resolveSimulatedEntityTenant(
      args.relatedEntityType, args.relatedEntityId, tenantId,
    );

    const resetter = simulationResetters[args.relatedEntityType];
    if (!resetter) {
      throw new Error(`No simulation resetter registered for ${args.relatedEntityType}`);
    }

    await this.context.prisma.simulationSession.updateMany({
      where: {
        relatedEntityType: args.relatedEntityType,
        relatedEntityId: args.relatedEntityId,
        status: { in: ['running', 'waiting'] },
        tenant_id_: entityTenantId,
      },
      data: { status: 'aborted', completedAt: new Date() },
    });

    await resetter({
      relatedEntityId: args.relatedEntityId,
      tenantId: entityTenantId,
      prisma: this.context.prisma,
      context: this.context,
    });
    return { ok: true };
  }

  /**
   * Resuelve un gate en espera (advance/fail/succeed) y re-encola el WorkerEvent
   * suspendido del run para reanudar; o aborta la sesión.
   */
  async control(args: {
    sessionId: string;
    gate?: string;
    action: ControlAction;
    faultType?: SimulationFault;
  }): Promise<ControlResult> {
    // Dos gates distintos y ambos necesarios:
    //  1. getSession lee ACOTADA a la empresa del operador (escape solo con el
    //     privilegio cross-tenant declarado). Antes era un findUnique por id sin
    //     tenant, y assertAllowed recibía el tenant DE LA SESIÓN: nunca se comparaba
    //     con el del operador, así que cualquiera con simulation_run resolvía gates
    //     de otra empresa —y eso re-encola sus WorkerEvent—.
    //  2. assertAllowed sigue mirando el tenant DUEÑO: el allowlist responde "¿esta
    //     empresa tiene simulación habilitada?", que es sobre el recurso, no sobre
    //     quien pide.
    const session = await this.getSession(args.sessionId);
    if (!session) throw new Error('SimulationSession not found');
    this.assertAllowed((session as any).tenant_id_);

    if (args.action === 'abort') {
      await this.context.prisma.simulationSession.update({
        where: { id: session.id },
        data: { status: 'aborted', completedAt: new Date() },
      });
      return { ok: true };
    }

    const gateKey = args.gate ?? (session as any).currentGate;
    if (!gateKey) throw new Error('No gate to resolve');

    const resolution = args.action === 'fail' ? (args.faultType ?? 'recoverable') : args.action;
    const resolved = { ...(((session as any).resolvedGates as any) ?? {}), [gateKey]: resolution };

    await this.context.prisma.simulationSession.update({
      where: { id: session.id },
      data: { resolvedGates: resolved, status: 'running', currentGate: null },
    });

    // Re-encolar el WorkerEvent suspendido del run (por correlationId) para reanudar.
    const waiting = await this.context.prisma.workerEvent.findFirst({
      where: { correlationId: (session as any).correlationId, status: 'waiting' },
      orderBy: { enqueuedAt: 'desc' },
    });
    if (waiting) {
      const p = (waiting.payload as any) ?? {};
      await this.context.prisma.workerEvent.update({
        where: { id: waiting.id },
        data: { status: 'queued' },
      });
      await enqueuePipelineJob(p.pipelineId, p.stageId, {
        payload: p.payload,
        workerEventId: waiting.id,
        ...(p.regionConfig ? { regionConfig: p.regionConfig } : {}),
        ...(p.proxyConfig ? { proxyConfig: p.proxyConfig } : {}),
        __simulation: { sessionId: session.id, mode: (session as any).mode },
      });
    }

    return { ok: true };
  }
}
