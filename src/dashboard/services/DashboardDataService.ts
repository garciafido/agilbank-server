/**
 * Dashboard Data Service
 *
 * Servicio principal para obtener datos de widgets del dashboard.
 * Usa acceso directo a Prisma para las entidades de dashboard.
 */

import { injectable, inject } from 'tsyringe';
import { createHash } from 'crypto';
import { PrismaClient } from '../../prisma/generated-client/client';
import { ServiceContext } from '../../service-context';
import { SchemaMetadataStore } from '../../common/services/schemaMetadata';
import { UnauthorizedError, NotFoundError } from '../../common/errors';
import { fetcherRegistry } from '../widgets/registry';
import { FetcherContext, WidgetData, WidgetCacheScope } from '../types';
import { redis } from '../../services/redis/redisClient';

// El cache se invalida proactivamente vía el bus `entity:mutations`
// (ver WidgetCacheInvalidator): una entrada vive hasta que un cambio
// real en sus sourceEntities la borra. El TTL es solo la red de
// seguridad para mensajes pub/sub perdidos — largo a propósito: el
// dashboard es informativo y NO debe recomputar contra la DB si nada
// cambió.
const WIDGET_CACHE_TTL = 6 * 60 * 60; // seconds (6h backstop)

// Presupuesto de espera del request: si la computación no termina en
// esta ventana, se responde { status: 'computing' } y el cliente
// muestra el estado de espera y repregunta (la computación sigue en
// background y puebla el cache).
const COMPUTE_WAIT_MS = 2000;

// Semáforo de computaciones: máximo de fetchers ejecutando queries a
// la vez EN TODO EL PROCESO. Una estampida de dashboards encola acá y
// gotea hacia Postgres — lo informativo no puede saturar lo operativo.
const MAX_CONCURRENT_COMPUTES = 3;
let activeComputes = 0;
const computeWaiters: Array<() => void> = [];

async function withComputeSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeComputes >= MAX_CONCURRENT_COMPUTES) {
    await new Promise<void>((resolve) => computeWaiters.push(resolve));
  }
  activeComputes++;
  try {
    return await fn();
  } finally {
    activeComputes--;
    const next = computeWaiters.shift();
    if (next) next();
  }
}

// Single-flight (request coalescing): N requests simultáneos del mismo
// cacheKey comparten UNA computación. El mapa es por proceso; entre
// réplicas coalesce el propio cache Redis.
const inFlightComputes = new Map<string, Promise<WidgetData>>();

/** Respuesta cuando la computación excede el presupuesto de espera. */
export type WidgetComputing = { status: 'computing' };
export type WidgetDataResult = WidgetData | WidgetComputing;

export function isComputing(r: WidgetDataResult): r is WidgetComputing {
  return (r as WidgetComputing).status === 'computing';
}

/** Espera `p` hasta `ms`; null = no llegó (sigue corriendo en background). */
function waitUpTo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function hashParams(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(sorted).digest('hex').slice(0, 12);
}

/**
 * Segmento de la cache key que segmenta por scope. La invalidación
 * usa SCAN con el patrón `dashboard:<tenantId>:<widgetKey>:*` así que
 * cubre todos los scope segments del mismo widget+tenant.
 *
 * - 'tenant' → 'all'                — todos los users del tenant comparten
 * - 'tenant+role' → 'role:<id del rol>' ('role:none' sin rol)
 * - 'tenant+user' → 'u:<userId>'
 */
function computeScopeKey(
  scope: WidgetCacheScope,
  user: { id?: string; role?: { id: string } | null } | undefined | null
): string {
  if (scope === 'tenant+user') {
    return `u:${user?.id ?? 'anon'}`;
  }
  if (scope === 'tenant+role') {
    // Un usuario tiene un rol o ninguno: los que no tienen comparten 'none'.
    return `role:${user?.role?.id ?? "none"}`;
  }
  return 'all';
}

/**
 * Resultado de obtener widgets disponibles para un usuario
 */
interface AvailableWidget {
  widgetKey: string;
  title: string;
  category: string;
  component: string;
  defaultConfig: Record<string, unknown>;
  userConfig?: {
    enabled: boolean;
    position: Record<string, unknown>;
    configOverride?: Record<string, unknown>;
  };
}

@injectable()
export class DashboardDataService {
  constructor(
    @inject('ServiceContext') private context: ServiceContext,
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject('SchemaMetadataStore') private schemaMetaStore: SchemaMetadataStore
  ) {}

  /**
   * Obtiene los widgets disponibles para el usuario actual.
   * Combina:
   * 1. Widgets globales (DashboardWidget)
   * 2. Acceso por tenant (TenantWidgetAccess)
   * 3. Configuración del usuario (UserWidgetConfig)
   */
  async getAvailableWidgets(): Promise<AvailableWidget[]> {
    if (!this.context.currentUser?.id) {
      throw new UnauthorizedError('Usuario no autenticado');
    }

    const userId = this.context.currentUser.id;
    const tenantId = this.context.currentUser.tenant_id_;

    // Sin empresa no hay widgets de empresa. El spread condicional de antes
    // (`...(tenantId && ...)`) OMITÍA el filtro cuando tenantId faltaba, así que
    // una consulta sin empresa devolvía los accesos de TODAS: fail-open. Se corta
    // acá para no consultar jamás la tabla sin acotar.
    if (!tenantId) {
      return [];
    }

    // 1. Obtener widgets habilitados para el tenant
    const tenantAccess = await this.prisma.tenantWidgetAccess.findMany({
      where: {
        enabled: true,
        tenant_id_: tenantId,
      },
      include: {
        widget: true,
      },
    });

    // 2. Obtener configuraciones del usuario
    const userConfigs = await this.prisma.userWidgetConfig.findMany({
      where: { user_id: userId },
    });

    // 3. Crear mapa de configuraciones de usuario por widget_id
    const userConfigMap = new Map<string, typeof userConfigs[0]>();
    for (const uc of userConfigs) {
      userConfigMap.set(uc.widget_id, uc);
    }

    // 4. Combinar datos
    const availableWidgets: AvailableWidget[] = tenantAccess
      .filter((ta) => ta.widget !== null)
      .map((ta) => {
        const widget = ta.widget!;
        const userConfig = userConfigMap.get(widget.id);

        return {
          widgetKey: widget.widgetKey,
          title: widget.title,
          category: widget.category || 'General',
          component: widget.component,
          defaultConfig: {
            ...(widget.defaultConfig as Record<string, unknown>),
            ...(ta.configOverride as Record<string, unknown>),
          },
          userConfig: userConfig
            ? {
                enabled: userConfig.enabled,
                position: userConfig.position as Record<string, unknown>,
                configOverride: userConfig.configOverride as
                  | Record<string, unknown>
                  | undefined,
              }
            : undefined,
        };
      });

    return availableWidgets;
  }

  /**
   * Obtiene datos para un widget específico. Camino cache-first:
   *
   *   1. Hit de Redis → respuesta inmediata (ni permisos ni DB).
   *   2. Miss → la computación entra al single-flight (requests
   *      simultáneos del mismo key comparten UNA ejecución) y al
   *      semáforo global (máx N fetchers computando por proceso).
   *   3. Si la computación no termina dentro del presupuesto de
   *      espera, responde { status: 'computing' } — la ejecución
   *      SIGUE en background, puebla el cache, y el próximo request
   *      (poll del cliente) la encuentra lista.
   *
   * Así el camino del dashboard nunca puede saturar Postgres: o sirve
   * Redis, o gotea por el semáforo.
   *
   * @param widgetKey Clave única del widget
   * @param queryParams Parámetros adicionales del frontend
   */
  async getWidgetData(
    widgetKey: string,
    queryParams: Record<string, string> = {}
  ): Promise<WidgetDataResult> {
    if (!this.context.currentUser?.id) {
      throw new UnauthorizedError('Usuario no autenticado');
    }

    const tenantId = this.context.currentUser.tenant_id_;

    // 1. Verificar que el widget existe
    const widget = await this.prisma.dashboardWidget.findUnique({
      where: { widgetKey },
      select: {
        id: true,
        widgetKey: true,
        dataFetcherKey: true,
        defaultConfig: true,
      },
    });

    if (!widget) {
      throw new NotFoundError(`Widget "${widgetKey}" no encontrado`);
    }

    // 2. Resolver la definición completa del fetcher (incluye cacheMode
    // y sourceEntities). El cacheMode determina si entramos al flujo de
    // Redis o consultamos la DB en cada request.
    const fetcherDef = fetcherRegistry.getDefinition(widget.dataFetcherKey);
    if (!fetcherDef) {
      throw new NotFoundError(
        `Fetcher "${widget.dataFetcherKey}" no registrado`
      );
    }
    const cacheMode = fetcherDef.cacheMode ?? 'fresh';

    // 3. Check Redis cache si el widget es cacheado. Hit-path corto:
    // pega solo a Redis y se evita pegar a la DB de permisos en miss
    // 0. Si Redis no contesta caemos al flujo completo. El segmento
    // <scopeKey> segmenta el cache por user/role según declare el
    // fetcher (evita leak cross-user cuando la query es per-user).
    const scopeKey = computeScopeKey(
      fetcherDef.cacheScope ?? 'tenant',
      this.context.currentUser
    );
    const cacheKey = `dashboard:${tenantId}:${widgetKey}:${scopeKey}:${hashParams(queryParams)}`;
    if (cacheMode === 'invalidated') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        // Redis unavailable — proceed without cache
      }
    }

    // 4. Single-flight: si el mismo key ya se está computando (por este
    // u otro request), esperar ESA promesa. Si no, arrancar la
    // computación bajo el semáforo global. Los `fresh` también
    // coalescen y pasan por el semáforo — su contrato es "sin cache
    // Redis", no "sin control de concurrencia".
    let computation = inFlightComputes.get(cacheKey);
    if (!computation) {
      computation = withComputeSlot(() =>
        this.computeWidgetData(widget, fetcherDef, cacheMode, cacheKey, queryParams)
      );
      inFlightComputes.set(cacheKey, computation);
      computation
        .catch(() => {
          // Los awaiters reciben el rechazo por su propia referencia;
          // este catch evita el unhandled rejection cuando todos los
          // requests ya respondieron 'computing'.
        })
        .finally(() => {
          inFlightComputes.delete(cacheKey);
        });
    }

    // 5. Esperar con presupuesto: datos si llegan a tiempo, si no
    // 'computing' (el cliente repregunta y encuentra el cache).
    const result = await waitUpTo(computation, COMPUTE_WAIT_MS);
    return result ?? { status: 'computing' };
  }

  /**
   * Datos de VARIOS widgets en una sola llamada (una carga de dashboard
   * = un request). Errores por-widget quedan aislados en su entrada —
   * un widget roto u obsoleto no tumba la tanda.
   */
  async getWidgetsData(
    requests: Array<{ widgetKey: string; queryParams?: Record<string, string> }>
  ): Promise<Record<string, WidgetDataResult | { error: string; code: string }>> {
    const results: Record<string, WidgetDataResult | { error: string; code: string }> = {};
    await Promise.all(
      requests.map(async ({ widgetKey, queryParams }) => {
        try {
          results[widgetKey] = await this.getWidgetData(widgetKey, queryParams ?? {});
        } catch (error) {
          const code =
            error instanceof NotFoundError ? 'NOT_FOUND'
            : error instanceof UnauthorizedError ? 'UNAUTHORIZED'
            : 'ERROR';
          results[widgetKey] = {
            error: error instanceof Error ? error.message : 'Error',
            code,
          };
        }
      })
    );
    return results;
  }

  /**
   * Computación real del widget: permisos + fetcher + populate del
   * cache. Corre dentro del semáforo global; puede seguir viva después
   * de que el request que la originó haya respondido 'computing'.
   */
  private async computeWidgetData(
    widget: { id: string; defaultConfig: unknown },
    fetcherDef: NonNullable<ReturnType<typeof fetcherRegistry.getDefinition>>,
    cacheMode: string,
    cacheKey: string,
    queryParams: Record<string, string>
  ): Promise<WidgetData> {
    const tenantId = this.context.currentUser!.tenant_id_;
    const userId = this.context.currentUser!.id;

    // Sin empresa no se sirve dato de widget. El spread condicional de abajo
    // OMITÍA el filtro cuando tenantId faltaba, así que el findFirst encontraba el
    // acceso de CUALQUIER empresa y servía datos ajenos: fail-open. Se deniega acá.
    if (!tenantId) {
      throw new UnauthorizedError('Widget no habilitado para este tenant');
    }

    // Otro proceso pudo poblar el cache mientras esperábamos el slot.
    if (cacheMode === 'invalidated') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {
        // Redis unavailable
      }
    }

    // Verificar acceso del tenant + obtener config del usuario en paralelo
    const [tenantAccess, userConfigRecord] = await Promise.all([
      this.prisma.tenantWidgetAccess.findFirst({
        where: {
          widget_id: widget.id,
          enabled: true,
          tenant_id_: tenantId,
        },
      }),
      this.prisma.userWidgetConfig.findFirst({
        where: { widget_id: widget.id, user_id: userId },
      }),
    ]);

    if (!tenantAccess) {
      throw new UnauthorizedError(
        `Widget no habilitado para este tenant`
      );
    }

    const tenantConfig = (tenantAccess.configOverride || {}) as Record<string, unknown>;
    const userConfig = (userConfigRecord?.configOverride || {}) as Record<string, unknown>;

    const fetcherContext: FetcherContext = {
      serviceContext: this.context,
      prisma: this.prisma,
      schemaMetaStore: this.schemaMetaStore,
      widgetConfig: {
        ...(widget.defaultConfig as Record<string, unknown>),
        ...tenantConfig,
        ...userConfig,
      },
      queryParams,
    };

    const result = await fetcherDef.fetcher(fetcherContext);

    // Cache solo si el widget es cacheado. Los `fresh` nunca pasan
    // por Redis — su contrato es "siempre fresh desde la DB".
    if (cacheMode === 'invalidated') {
      try {
        await redis.setex(cacheKey, WIDGET_CACHE_TTL, JSON.stringify(result));
      } catch {
        // Redis unavailable — skip caching
      }
    }

    return result;
  }

  /**
   * Actualiza la configuración de un widget para el usuario actual.
   */
  async updateUserWidgetConfig(
    widgetKey: string,
    config: {
      enabled?: boolean;
      position?: Record<string, unknown>;
      configOverride?: Record<string, unknown>;
      displayOrder?: number;
    }
  ): Promise<void> {
    if (!this.context.currentUser?.id) {
      throw new UnauthorizedError('Usuario no autenticado');
    }

    const userId = this.context.currentUser.id;

    // 1. Obtener el widget
    const widget = await this.prisma.dashboardWidget.findUnique({
      where: { widgetKey },
      select: { id: true },
    });

    if (!widget) {
      throw new NotFoundError(`Widget "${widgetKey}" no encontrado`);
    }

    // 2. Buscar config existente
    const existingConfig = await this.prisma.userWidgetConfig.findFirst({
      where: { widget_id: widget.id, user_id: userId },
      select: { id: true },
    });

    const now = new Date();
    const tenantId = this.context.currentUser.tenant_id_;

    if (existingConfig) {
      // Actualizar existente
      await this.prisma.userWidgetConfig.update({
        where: { id: existingConfig.id },
        data: {
          ...(config.enabled !== undefined && { enabled: config.enabled }),
          ...(config.position && { position: config.position }),
          ...(config.configOverride && {
            configOverride: config.configOverride,
          }),
          ...(config.displayOrder !== undefined && {
            displayOrder: config.displayOrder,
          }),
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: userId } },
        },
      });
    } else {
      // Crear nueva config
      await this.prisma.userWidgetConfig.create({
        data: {
          widget: { connect: { id: widget.id } },
          user: { connect: { id: userId } },
          tenant_: { connect: { id: tenantId } },
          enabled: config.enabled ?? true,
          position: config.position ?? { x: 0, y: 0, width: 2, height: 2 },
          configOverride: config.configOverride,
          displayOrder: config.displayOrder,
          createdAt_: now,
          version_: '0',
          createdBy_: { connect: { id: userId } },
          lastUpdatedAt_: now,
          lastUpdatedBy_: { connect: { id: userId } },
        },
      });
    }
  }
}
