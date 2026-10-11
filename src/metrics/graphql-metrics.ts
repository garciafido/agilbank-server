import type { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { logger } from '../utils/logger';
import { graphqlOperationsTotal, graphqlOperationDuration } from './registry';

/**
 * Apollo Server plugin to collect GraphQL metrics
 */
export function createGraphQLMetricsPlugin<TContext>(): ApolloServerPlugin<TContext> {
  return {
    async requestDidStart(): Promise<GraphQLRequestListener<TContext>> {
      const startTime = process.hrtime.bigint();

      return {
        async willSendResponse(requestContext) {
          const endTime = process.hrtime.bigint();
          const durationSeconds = Number(endTime - startTime) / 1e9;

          const operationName = requestContext.operationName || 'anonymous';
          const operationType = requestContext.operation?.operation || 'unknown';
          const hasErrors = (requestContext.errors?.length ?? 0) > 0;
          const status = hasErrors ? 'error' : 'success';

          // Ruido sin valor de supervisión: introspección (playground) y el
          // refresco de token (altísima frecuencia, pre-auth, cero señal de
          // comportamiento — inundaría métricas y auditoría).
          if (operationName === 'IntrospectionQuery' || operationName === 'RefreshToken') {
            return;
          }

          // Identidad del caller: el contexto Apollo del generador expone
          // currentUser (ServiceContext). Defensivo: el plugin es genérico.
          const ctx = requestContext.contextValue as {
            currentUser?: { id?: string; email?: string; tenant_id_?: string } | null;
          };
          const tenant = ctx?.currentUser?.tenant_id_ ?? 'anonymous';
          const userId = ctx?.currentUser?.id ?? null;
          const userEmail = ctx?.currentUser?.email ?? null;

          // Record metrics (comportamiento agregado por tenant → Grafana)
          graphqlOperationsTotal.inc({
            operation_type: operationType,
            operation_name: operationName,
            status,
            tenant,
          });

          graphqlOperationDuration.observe(
            {
              operation_type: operationType,
              operation_name: operationName,
              tenant,
            },
            durationSeconds
          );

          // Auditoría fina POR USUARIO (una línea estructurada por operación →
          // Loki vía el shipping de logs): quién hizo qué, cuándo y cuánto tardó.
          logger.info(
            {
              audit: 'graphql_operation',
              tenant,
              userId,
              userEmail,
              operation: operationName,
              type: operationType,
              status,
              durationMs: Math.round(durationSeconds * 1000),
              errorCount: requestContext.errors?.length ?? 0,
            },
            'graphql_operation'
          );
        },

        async didEncounterErrors(requestContext) {
          const operationName = requestContext.operationName || 'anonymous';
          const operationType = requestContext.operation?.operation || 'unknown';

          // Already counted in willSendResponse, but log for debugging
          // console.debug(`GraphQL error in ${operationType} ${operationName}`);
        },
      };
    },
  };
}
