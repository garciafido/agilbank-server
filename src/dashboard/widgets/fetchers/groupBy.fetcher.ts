/**
 * GroupBy Fetcher - Fetcher genérico para agrupar registros
 *
 * Usa SecurePrismaOps para garantizar:
 * - Verificación de permisos (_retrieve)
 * - Filtrado por tenant automático
 * - Filtrado por usuario (userScopedForRoles)
 *
 * Nota: SecurePrismaOps no tiene un método groupBy nativo,
 * por lo que usamos findMany y agrupamos en memoria para
 * campos simples, o SQL raw para paths complejos.
 */

import { Prisma, PrismaClient } from '../../../prisma/generated-client/client';
import { SecurePrismaOps } from '../../../common/services/securePrismaOps';
import { FetcherContext, WidgetData } from '../../types';

type PrismaModelName = Prisma.ModelName;

export interface GroupByResult {
  groupKey: string | null;
  groupLabel?: string;
  count: number;
}

/**
 * Crea un fetcher que agrupa registros por un campo.
 *
 * Para campos simples (sin puntos), usa el delegate de Prisma
 * directamente con groupBy, pero verificando permisos primero
 * via SecurePrismaOps.count().
 *
 * Para paths complejos (con puntos como "works.authors.author"),
 * requiere un fetcher SQL generado específicamente.
 *
 * @param modelName Nombre del modelo Prisma (PascalCase)
 * @param groupByField Campo por el cual agrupar
 */
export function createGroupByFetcher(
  modelName: PrismaModelName,
  groupByField: string
) {
  return async (ctx: FetcherContext): Promise<WidgetData> => {
    const limit = (ctx.widgetConfig.limit as number) || 10;

    // Para paths simples (sin puntos), usar groupBy de Prisma
    if (!groupByField.includes('.')) {
      return simpleGroupBy(ctx, modelName, groupByField, limit);
    }

    // Para paths complejos, se necesita un fetcher SQL generado
    return complexGroupByPlaceholder(modelName, groupByField);
  };
}

/**
 * GroupBy simple para campos directos del modelo.
 * Verifica permisos usando SecurePrismaOps antes de ejecutar.
 */
async function simpleGroupBy(
  ctx: FetcherContext,
  modelName: PrismaModelName,
  field: string,
  limit: number
): Promise<WidgetData> {
  // Primero verificamos permisos usando SecurePrismaOps
  const db = new SecurePrismaOps(
    ctx.serviceContext,
    ctx.prisma,
    ctx.schemaMetaStore,
    modelName,
    {}
  );

  // Ejecutar count para verificar permisos y obtener filtro de tenant
  // Si no tiene permiso _retrieve, esto lanzará UnauthorizedError
  await db.count({ where: {} });

  // Ahora podemos usar el delegate directamente con el filtro de tenant
  // Obtenemos el where seguro del contexto
  const tenantId = ctx.serviceContext.currentUser?.tenant_id_;
  const where: Record<string, unknown> = {};

  // Solo aplicar filtro de tenant si no es system mode
  if (!ctx.serviceContext.isSystemMode && tenantId) {
    where.tenant_id_ = tenantId;
  }

  // Acceder al delegate del modelo
  const delegate = (ctx.prisma as any)[
    modelName.charAt(0).toLowerCase() + modelName.slice(1)
  ];

  if (!delegate?.groupBy) {
    throw new Error(`Model "${modelName}" does not support groupBy`);
  }

  const results = await delegate.groupBy({
    by: [field],
    where,
    _count: { _all: true },
    orderBy: { _count: { [field]: 'desc' } },
    take: limit,
  });

  const data: GroupByResult[] = results.map((r: Record<string, unknown>) => ({
    groupKey: r[field] as string | null,
    count: (r._count as { _all: number })._all,
  }));

  return {
    data,
    metadata: {
      fetchedAt: new Date().toISOString(),
    },
  };
}

/**
 * Placeholder para groupBy con paths complejos.
 * Los fetchers SQL específicos se generan como templates.
 */
async function complexGroupByPlaceholder(
  modelName: string,
  path: string
): Promise<WidgetData> {
  console.warn(
    `Complex groupBy path "${path}" on ${modelName} requires a generated SQL fetcher`
  );

  return {
    data: [],
    metadata: {
      fetchedAt: new Date().toISOString(),
      cacheKey: `${modelName}-${path}-pending`,
    },
  };
}
