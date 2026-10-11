/**
 * PATAY Tools - Query Tool
 *
 * Main tool for retrieving entity records.
 * Supports filtering, ordering, pagination, and relation loading.
 *
 * Use this tool when you need to:
 * - List entities: "show all works", "list authors"
 * - Find specific records: "works by author X", "works in genre Y"
 * - Get details: "the genre of work X" (use limit: 1)
 *
 * Do NOT use for counting or statistics - use aggregate instead.
 */

import {
  QueryArgs,
  QueryResult,
  ToolContext,
  ToolResult,
  ToolValidationError,
  OrderBy,
} from './types';
import { validateEntity } from '../validators/entityValidator';
import { validateFilters } from '../validators/filterValidator';
import { buildWhere, WhereBuilderOptions } from '../builders/whereBuilder';
import { buildSelect } from '../builders/selectBuilder';
import { buildInclude, IncludeBuilderOptions } from '../builders/includeBuilder';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_SKIP = 10000;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate query arguments
 */
function validateQueryArgs(args: QueryArgs): ToolResult<void> {
  // Entity is required
  if (!args.entity || typeof args.entity !== 'string') {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      field: 'entity',
      message: 'Entity name is required',
      suggestion: 'Specify the entity to query, e.g., entity: "Author"',
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
        suggestion: `Use a number between 1 and ${MAX_LIMIT}`,
      };
      return { success: false, error };
    }
    if (args.limit > MAX_LIMIT) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'limit',
        message: `Limit cannot exceed ${MAX_LIMIT}`,
        suggestion: `Use pagination with skip to retrieve more records`,
      };
      return { success: false, error };
    }
  }

  // Validate skip
  if (args.skip !== undefined) {
    if (typeof args.skip !== 'number' || args.skip < 0) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'skip',
        message: 'Skip must be a non-negative number',
      };
      return { success: false, error };
    }
    if (args.skip > MAX_SKIP) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'skip',
        message: `Skip cannot exceed ${MAX_SKIP}`,
        suggestion: 'Use cursor-based pagination for large offsets',
      };
      return { success: false, error };
    }
  }

  return { success: true, data: undefined };
}

/**
 * Validate and build order by
 */
function validateOrderBy(orderBy: OrderBy[] | undefined): ToolResult<Array<Record<string, 'asc' | 'desc'>> | undefined> {
  if (!orderBy || orderBy.length === 0) {
    return { success: true, data: undefined };
  }

  const prismaOrderBy: Array<Record<string, 'asc' | 'desc'>> = [];

  for (const order of orderBy) {
    if (!order.field || typeof order.field !== 'string') {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'orderBy',
        message: 'Each orderBy must have a field name',
      };
      return { success: false, error };
    }

    const direction = order.direction || 'asc';
    if (direction !== 'asc' && direction !== 'desc') {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: 'orderBy',
        message: 'Direction must be "asc" or "desc"',
      };
      return { success: false, error };
    }

    prismaOrderBy.push({ [order.field]: direction });
  }

  return { success: true, data: prismaOrderBy };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Execute query tool
 *
 * Validates inputs, builds Prisma query, and executes against database.
 */
export async function executeQuery(
  args: QueryArgs,
  context: ToolContext
): Promise<ToolResult<QueryResult>> {
  // Validate basic args
  const argsValidation = validateQueryArgs(args);
  if (!argsValidation.success) {
    return argsValidation as ToolResult<QueryResult>;
  }

  // Validate entity exists
  const entityValidation = validateEntity(context.schema, args.entity, context.lang);
  if (!entityValidation.success) {
    return entityValidation as ToolResult<QueryResult>;
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
      return filtersValidation as ToolResult<QueryResult>;
    }
    prismaWhere = buildWhere(
      filtersValidation.data.filters,
      filtersValidation.data.resolvedFields,
      whereOptions
    );
  } else if (context.tenantId) {
    prismaWhere = { tenantId: context.tenantId };
  }

  // Build select
  const prismaSelect = buildSelect(entity, args.select);

  // Build include
  const includeOptions: IncludeBuilderOptions = {
    ...whereOptions,
    maxDepth: 3,
    defaultTake: 10,
  };
  const prismaInclude = buildInclude(
    context.schema,
    entity,
    args.include,
    includeOptions
  );

  // Validate and build order by
  const orderByValidation = validateOrderBy(args.orderBy);
  if (!orderByValidation.success) {
    return orderByValidation as ToolResult<QueryResult>;
  }
  const prismaOrderBy = orderByValidation.data;

  // Build pagination
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const skip = args.skip ?? 0;

  // Build distinct
  const prismaDistinct = args.distinct && args.distinct.length > 0 ? args.distinct : undefined;

  // Build Prisma query
  const prismaQuery: Record<string, unknown> = {
    where: prismaWhere,
    take: limit + 1, // Take one extra to check hasMore
    skip,
  };

  if (prismaSelect) {
    prismaQuery.select = prismaSelect;
  }

  if (prismaInclude) {
    // Can't use both select and include
    delete prismaQuery.select;
    prismaQuery.include = prismaInclude;
  }

  if (prismaOrderBy) {
    prismaQuery.orderBy = prismaOrderBy;
  }

  if (prismaDistinct) {
    prismaQuery.distinct = prismaDistinct;
  }

  // Execute query
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

    // Execute findMany
    const records = await model.findMany(prismaQuery);

    // Check if there are more records
    const hasMore = records.length > limit;
    const data = hasMore ? records.slice(0, limit) : records;

    // Get total count (separate query for efficiency)
    const total = await model.count({ where: prismaWhere });

    return {
      success: true,
      data: {
        data,
        total,
        hasMore,
        pagination: {
          limit,
          skip,
          returned: data.length,
        },
      },
    };
  } catch (error) {
    const err = error as Error;
    const validationError: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      message: `Query execution failed: ${err.message}`,
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
 * Build query tool for LLM tool definition
 */
export function getQueryToolDefinition() {
  return {
    name: 'query',
    description: `Retrieves entity records matching your criteria.

Use when you need to:
- List entities: "show all works", "list authors"
- Find specific records: "works by author X", "works in genre Y"
- Get details: "the genre of work X" (use limit: 1)

Do NOT use for counting or statistics - use aggregate instead.`,
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: 'Entity to query (required). Use the entity name like "Author", "MusicalWork".',
        },
        filters: {
          type: 'array',
          description: 'Filter conditions. Each filter has field, operator, and value.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field name or path (e.g., "name" or "author.country.name")' },
              operator: {
                type: 'string',
                enum: ['equals', 'contains', 'startsWith', 'endsWith', 'not', 'gt', 'gte', 'lt', 'lte'],
                description: 'Comparison operator',
              },
              value: { type: 'string', description: 'Value to compare against' },
            },
          },
        },
        orderBy: {
          type: 'array',
          description: 'Sort order.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
        },
        limit: {
          type: 'number',
          description: `Maximum records to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
        },
        skip: {
          type: 'number',
          description: 'Records to skip for pagination (default: 0)',
        },
        include: {
          type: 'array',
          description: 'Relations to include',
          items: {
            type: 'object',
            properties: {
              relation: { type: 'string', description: 'Relation field name' },
            },
          },
        },
      },
      required: ['entity'],
    },
  };
}
