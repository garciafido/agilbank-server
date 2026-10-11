/**
 * Next Page Tool
 *
 * Stateful pagination - continues from the last query without parameters.
 * The conversation service stores the query state, so the LLM just calls next_page().
 * Supports both entity queries (tables) and aggregations (charts).
 */

import { Tool } from './types';
import { SearchContext, SearchToolResult, QueryState } from '../types';
import { getQueryState, setQueryState } from '../orchestrator/conversationService';

/**
 * Create next_page tool factory
 *
 * @param executeQuery - Function to execute entity queries (tables)
 * @param executeAggregation - Function to execute aggregation queries (charts)
 */
export function createNextPageTool(
  executeQuery: (
    entity: string,
    args: Record<string, unknown>,
    context: SearchContext
  ) => Promise<SearchToolResult>,
  executeAggregation?: (
    entity: string,
    args: Record<string, unknown>,
    context: SearchContext
  ) => Promise<SearchToolResult>
): Tool {
  return {
    name: 'next_page',
    description: 'Obtiene la siguiente página de resultados de la última consulta. NO requiere parámetros - el sistema recuerda la consulta anterior.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },

    handler: async (_args: Record<string, unknown>, context: SearchContext): Promise<SearchToolResult> => {
      try {
        // Get conversation ID from context
        const conversationId = context.conversationId;
        if (!conversationId) {
          return {
            success: false,
            error: 'No hay contexto de conversación',
          };
        }

        // Get stored query state
        const queryState = getQueryState(conversationId);
        if (!queryState) {
          return {
            success: false,
            error: 'No hay consulta anterior. Primero realice una consulta con query_entities.',
          };
        }

        if (!queryState.hasMore) {
          return {
            success: false,
            error: 'No hay más resultados disponibles.',
          };
        }

        // Execute the same query with updated skip
        const argsWithSkip = {
          ...queryState.args,
          skip: queryState.currentSkip,
          limit: queryState.pageSize,
        };

        // Detect if this is an aggregation query (has groupBy) or entity query
        const isAggregation = 'groupBy' in queryState.args && queryState.args.groupBy;

        let result: SearchToolResult;
        if (isAggregation && executeAggregation) {
          result = await executeAggregation(queryState.entity, argsWithSkip, context);
        } else {
          result = await executeQuery(queryState.entity, argsWithSkip, context);
        }

        // Update query state if successful
        if (result.success && result.data) {
          const newState: QueryState = {
            entity: queryState.entity,
            args: queryState.args,
            currentSkip: queryState.currentSkip + queryState.pageSize,
            pageSize: queryState.pageSize,
            hasMore: result.data.hasMore ?? false,
          };
          setQueryState(conversationId, newState);
        }

        return result;
      } catch (error) {
        console.error('[NextPageTool]', error);
        return {
          success: false,
          error: 'Error al obtener siguiente página',
        };
      }
    },
  };
}
