/**
 * PATAY Tools - Aggregate Tool
 *
 * Computes statistics on entity records.
 * Supports count, sum, avg, min, max with optional groupBy.
 *
 * Use when you need to:
 * - Count: "how many works", "number of authors"
 * - Statistics: "average duration", "max percentage"
 * - Distribution: "works per genre", "authors by country"
 *
 * Returns a number (simple count) or array of groups.
 */

import {
  AggregateArgs,
  AggregateResult,
  AggregateResultSimple,
  AggregateResultGrouped,
  ToolContext,
  ToolResult,
  ToolValidationError,
  AggregateOperation,
} from './types';
import { validateEntity } from '../validators/entityValidator';
import { validateFilters, findField } from '../validators/filterValidator';
import { buildWhere, WhereBuilderOptions } from '../builders/whereBuilder';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_GROUP_LIMIT = 100;
const DEFAULT_GROUP_LIMIT = 20;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate aggregate arguments
 */
function validateAggregateArgs(args: AggregateArgs): ToolResult<void> {
  // Entity is required
  if (!args.entity || typeof args.entity !== 'string') {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      field: 'entity',
      message: 'Entity name is required',
      suggestion: 'Specify the entity to aggregate, e.g., entity: "Author"',
    };
    return { success: false, error };
  }

  // Operation is required
  const validOperations: AggregateOperation[] = ['count', 'sum', 'avg', 'min', 'max'];
  if (!args.operation || !validOperations.includes(args.operation)) {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      field: 'operation',
      message: 'Valid operation is required',
      suggestion: `Use one of: ${validOperations.join(', ')}`,
    };
    return { success: false, error };
  }

  // Field is required for non-count operations
  if (args.operation !== 'count' && !args.field) {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      field: 'field',
      message: `Field is required for "${args.operation}" operation`,
      suggestion: 'Specify the numeric field to aggregate',
    };
    return { success: false, error };
  }

  // Validate limit
  if (args.limit !== undefined) {
    if (typeof args.limit !== 'number' || args.limit < 1) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'limit',
        message: 'Limit must be a positive number',
      };
      return { success: false, error };
    }
    if (args.limit > MAX_GROUP_LIMIT) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'limit',
        message: `Limit cannot exceed ${MAX_GROUP_LIMIT} for aggregations`,
      };
      return { success: false, error };
    }
  }

  return { success: true, data: undefined };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Execute aggregate tool
 *
 * Validates inputs, builds Prisma query, and executes against database.
 */
export async function executeAggregate(
  args: AggregateArgs,
  context: ToolContext
): Promise<ToolResult<AggregateResult>> {
  // Validate basic args
  const argsValidation = validateAggregateArgs(args);
  if (!argsValidation.success) {
    return argsValidation as ToolResult<AggregateResult>;
  }

  // Validate entity exists
  const entityValidation = validateEntity(context.schema, args.entity, context.lang);
  if (!entityValidation.success) {
    return entityValidation as ToolResult<AggregateResult>;
  }
  const entity = entityValidation.data.entity;

  // Build where clause options
  const whereOptions: WhereBuilderOptions = {
    defaultCaseInsensitive: true,
    tenantId: context.tenantId,
  };

  // Validate and build filters
  let prismaWhere = {};
  if (args.filters && args.filters.length > 0) {
    const filtersValidation = validateFilters(
      context.schema,
      entity,
      args.filters,
      context.lang
    );
    if (!filtersValidation.success) {
      return filtersValidation as ToolResult<AggregateResult>;
    }
    prismaWhere = buildWhere(
      filtersValidation.data.filters,
      filtersValidation.data.resolvedFields,
      whereOptions
    );
  } else if (context.tenantId) {
    prismaWhere = { tenantId: context.tenantId };
  }

  // Validate field exists (for non-count operations)
  if (args.field && args.operation !== 'count') {
    const field = findField(entity, args.field);
    if (!field) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'field',
        message: `Field "${args.field}" not found in entity "${entity.name}"`,
        suggestion: `Available numeric fields: ${entity.fields
          .filter(f => ['Int', 'Float', 'Decimal'].includes(f.type))
          .map(f => f.name)
          .join(', ')}`,
      };
      return { success: false, error };
    }

    // Validate field is numeric for aggregation
    if (!['Int', 'Float', 'Decimal'].includes(field.type)) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'field',
        message: `Field "${args.field}" is not numeric (type: ${field.type})`,
        suggestion: `${args.operation} operation requires a numeric field`,
      };
      return { success: false, error };
    }
  }

  // Validate groupBy field exists
  let groupByFields: string[] = [];
  if (args.groupBy) {
    groupByFields = Array.isArray(args.groupBy) ? args.groupBy : [args.groupBy];

    for (const groupField of groupByFields) {
      const field = findField(entity, groupField);
      if (!field) {
        const error: ToolValidationError = {
          code: 'VALIDATION_ERROR',
          field: 'groupBy',
          message: `Field "${groupField}" not found in entity "${entity.name}"`,
          suggestion: `Available groupable fields: ${entity.fields
            .filter(f => f.isGroupable || f.isRelation || f.type === 'Enum')
            .map(f => f.name)
            .join(', ')}`,
        };
        return { success: false, error };
      }
    }
  }

  // Execute based on operation type
  try {
    const prisma = context.prisma as Record<string, any>;
    const model = prisma[entity.tableName || lowercaseFirst(entity.name)];

    if (!model) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Entity "${entity.name}" does not have a corresponding Prisma model`,
      };
      return { success: false, error };
    }

    // Simple count without groupBy
    if (args.operation === 'count' && groupByFields.length === 0) {
      const count = await model.count({ where: prismaWhere });
      const result: AggregateResultSimple = { value: count };
      return { success: true, data: result };
    }

    // GroupBy aggregation
    if (groupByFields.length > 0) {
      const groupByQuery: Record<string, unknown> = {
        by: groupByFields,
        where: prismaWhere,
      };

      // Add aggregation
      if (args.operation === 'count') {
        groupByQuery._count = true;
      } else if (args.field) {
        groupByQuery[`_${args.operation}`] = { [args.field]: true };
      }

      // Add ordering
      if (args.orderBy) {
        groupByQuery.orderBy = { [args.orderBy.field]: args.orderBy.direction };
      } else {
        // Default: order by count descending
        groupByQuery.orderBy = { _count: { [groupByFields[0]]: 'desc' } };
      }

      // Add limit
      groupByQuery.take = args.limit ?? DEFAULT_GROUP_LIMIT;

      // Add having if specified
      if (args.having) {
        const havingValue: Record<string, unknown> = {};
        if (args.having.operation === 'count') {
          havingValue._count = {
            [groupByFields[0]]: { [args.having.operator]: args.having.value },
          };
        } else if (args.having.field) {
          havingValue[`_${args.having.operation}`] = {
            [args.having.field]: { [args.having.operator]: args.having.value },
          };
        }
        groupByQuery.having = havingValue;
      }

      const groups = await model.groupBy(groupByQuery);

      // Transform to result format
      const result: AggregateResultGrouped = {
        groups: groups.map((g: Record<string, unknown>) => {
          const key: Record<string, unknown> = {};
          for (const field of groupByFields) {
            key[field] = g[field];
          }

          let value: number;
          if (args.operation === 'count') {
            value = (g._count as number) || 0;
          } else if (args.field) {
            const aggResult = g[`_${args.operation}`] as Record<string, number>;
            value = aggResult?.[args.field] || 0;
          } else {
            value = 0;
          }

          return { key, value };
        }),
      };

      return { success: true, data: result };
    }

    // Simple aggregation without groupBy (sum, avg, min, max)
    if (args.field) {
      const aggregateQuery = {
        where: prismaWhere,
        [`_${args.operation}`]: { [args.field]: true },
      };

      const aggResult = await model.aggregate(aggregateQuery);
      const value = aggResult[`_${args.operation}`]?.[args.field] || 0;

      const result: AggregateResultSimple = { value };
      return { success: true, data: result };
    }

    // Fallback to count
    const count = await model.count({ where: prismaWhere });
    const result: AggregateResultSimple = { value: count };
    return { success: true, data: result };

  } catch (error) {
    const err = error as Error;
    const validationError: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      message: `Aggregation failed: ${err.message}`,
    };
    return { success: false, error: validationError };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Lowercase first character
 */
function lowercaseFirst(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Build aggregate tool for LLM tool definition
 */
export function getAggregateToolDefinition() {
  return {
    name: 'aggregate',
    description: `Computes statistics on entity records.

Use when you need to:
- Count: "how many works", "number of authors"
- Statistics: "average duration", "max percentage"
- Distribution: "works per genre", "authors by country"

Returns a number (simple count) or array of groups.`,
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: 'Entity to aggregate (required). Use the entity name like "Author", "MusicalWork".',
        },
        operation: {
          type: 'string',
          enum: ['count', 'sum', 'avg', 'min', 'max'],
          description: 'Aggregation operation (required).',
        },
        field: {
          type: 'string',
          description: 'Numeric field to aggregate (required for sum/avg/min/max).',
        },
        filters: {
          type: 'array',
          description: 'Filter conditions before aggregating.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        groupBy: {
          type: 'string',
          description: 'Field to group results by. Returns array of { key, value } instead of single number.',
        },
        orderBy: {
          type: 'object',
          description: 'Sort order for groups.',
          properties: {
            field: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
        limit: {
          type: 'number',
          description: `Maximum groups to return (default: ${DEFAULT_GROUP_LIMIT}, max: ${MAX_GROUP_LIMIT})`,
        },
      },
      required: ['entity', 'operation'],
    },
  };
}
