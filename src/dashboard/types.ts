/**
 * Dashboard Types - Tipos para el sistema de widgets
 *
 * Los fetchers usan SecurePrismaOps para garantizar:
 * - Permisos del usuario
 * - Filtrado por tenant
 * - Filtrado por usuario (userScopedForRoles)
 */

import { PrismaClient } from '../prisma/generated-client/client';
import { ServiceContext } from '../service-context';
import { SchemaMetadataStore } from '../common/services/schemaMetadata';

/**
 * Contexto pasado a los data fetchers.
 * Incluye todo lo necesario para crear SecurePrismaOps.
 */
export interface FetcherContext {
  /** ServiceContext de la petición actual */
  serviceContext: ServiceContext;
  /** Cliente Prisma base */
  prisma: PrismaClient;
  /** Store de metadata del schema */
  schemaMetaStore: SchemaMetadataStore;
  /** Configuración del widget (desde DashboardWidget) */
  widgetConfig: Record<string, unknown>;
  /** Parámetros de query (filtros adicionales del frontend) */
  queryParams: Record<string, string>;
}

/**
 * Resultado de un data fetcher
 */
export interface WidgetData {
  data: unknown;
  metadata?: {
    fetchedAt: string;
    cacheKey?: string;
  };
}

/**
 * Función que obtiene datos para un widget
 */
export interface DataFetcher {
  (ctx: FetcherContext): Promise<WidgetData>;
}

/**
 * Modo de cache de un widget en el server.
 *
 * - `'fresh'` (default): el endpoint del widget ejecuta el fetcher
 *   contra la DB en cada request. Sin cache. Pull-only desde el
 *   cliente, "datos vivos" garantizados a costo de latencia.
 *
 * - `'invalidated'`: el endpoint cachea en Redis con TTL backstop.
 *   La key se invalida por evento del bus `entity:mutations` cuando
 *   muta cualquiera de las `sourceEntities`. Para widgets pesados
 *   (joins, group-by, agregaciones) donde la latencia importa pero
 *   "datos viejos" es inaceptable.
 */
export type WidgetCacheMode = 'fresh' | 'invalidated';

/**
 * Granularidad del cache para un widget cacheado.
 *
 * - `'tenant'`: cache compartido por todos los users del tenant.
 *   Correcto si la query no aplica filtros per-user.
 * - `'tenant+role'`: el cache se segmenta por rol del user.
 *   Necesario si la entidad raíz tiene `.userScopedForRoles(...)`
 *   o `.crossTenantForRoles`.
 * - `'tenant+user'`: cache por user individual. Necesario si la
 *   entidad raíz tiene `.ownerScoped` (filtro por `createdBy_`).
 *
 * El generador deriva este valor automáticamente al ver los
 * modifiers de la entidad raíz de cada métrica `.cached()`.
 */
export type WidgetCacheScope = 'tenant' | 'tenant+role' | 'tenant+user';

/**
 * Definición de un fetcher registrado
 */
export interface FetcherDefinition {
  key: string;
  fetcher: DataFetcher;
  description?: string;
  /**
   * Modo de cache server-side. Default `'fresh'`.
   */
  cacheMode?: WidgetCacheMode;
  /**
   * Entidades cuyas mutaciones invalidan el cache del widget. Solo
   * relevante si `cacheMode === 'invalidated'`. Se matchea contra
   * `entityType` y `parentChain` del evento del bus. Para widgets
   * sobre paths relacionales incluye también las entidades
   * atravesadas (e.g., un groupBy(authors.author) sobre MusicalWork
   * declara ['MusicalWork', 'WorkAuthor', 'Author']).
   */
  sourceEntities?: string[];
  /**
   * Granularidad del cache. Solo relevante si
   * `cacheMode === 'invalidated'`. Default `'tenant'`. Si se omite,
   * todos los users del tenant comparten cache — solo es seguro si
   * la query no varía por user. El generador lo auto-deriva del
   * scoping de la entidad raíz.
   */
  cacheScope?: WidgetCacheScope;
}

/**
 * Posición de un widget en el dashboard
 */
export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Configuración de un widget para un usuario
 */
export interface UserWidgetLayout {
  widgetKey: string;
  position: WidgetPosition;
  enabled: boolean;
  configOverride?: Record<string, unknown>;
}

/**
 * Layout completo del dashboard de un usuario
 */
export interface DashboardLayout {
  widgets: UserWidgetLayout[];
  userId: string;
  tenantId: string;
}
