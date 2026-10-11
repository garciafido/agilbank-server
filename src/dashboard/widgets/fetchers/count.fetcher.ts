/**
 * Count Fetcher - Fetcher genérico para contar registros
 *
 * Usa SecurePrismaOps para garantizar:
 * - Verificación de permisos (_retrieve)
 * - Filtrado por tenant automático
 * - Filtrado por usuario (userScopedForRoles)
 */

import { Prisma } from '../../../prisma/generated-client/client';
import { SecurePrismaOps } from '../../../common/services/securePrismaOps';
import { FetcherContext, WidgetData } from '../../types';

type PrismaModelName = Prisma.ModelName;

/**
 * Crea un fetcher que cuenta registros de un modelo.
 * El conteo respeta todos los filtros de seguridad:
 * - Permisos del usuario
 * - Tenant del usuario
 * - Reglas userScopedForRoles
 *
 * @param modelName Nombre del modelo Prisma (PascalCase)
 */
export function createCountFetcher(modelName: PrismaModelName) {
  return async (ctx: FetcherContext): Promise<WidgetData> => {
    // Crear instancia de SecurePrismaOps para este modelo
    const db = new SecurePrismaOps(
      ctx.serviceContext,
      ctx.prisma,
      ctx.schemaMetaStore,
      modelName,
      {}
    );

    // El count ya aplica filtros de tenant/permisos internamente
    const count = await db.count({ where: {} });

    return {
      data: { count, entityName: modelName },
      metadata: {
        fetchedAt: new Date().toISOString(),
      },
    };
  };
}
