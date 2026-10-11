/**
 * PATAY Builders - Where Clause Builder
 *
 * Converts validated filters to Prisma WHERE clauses.
 * Handles nested paths, OR/AND logic, and case sensitivity.
 */

import {
  Filter,
  FilterExpression,
  OrFilter,
  AndFilter,
  Operator,
  FieldType,
} from '../tools/types';
import { ResolvedFieldPath } from '../validators/filterValidator';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prisma-compatible where clause
 */
export type PrismaWhere = Record<string, unknown>;

/**
 * Options for building where clauses
 */
export interface WhereBuilderOptions {
  /** Default to case-insensitive string matching (default: true) */
  defaultCaseInsensitive?: boolean;

  /** Apply tenant filter */
  tenantId?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if filter is OrFilter
 */
function isOrFilter(filter: FilterExpression): filter is OrFilter {
  return 'or' in filter && Array.isArray((filter as OrFilter).or);
}

/**
 * Check if filter is AndFilter
 */
function isAndFilter(filter: FilterExpression): filter is AndFilter {
  return 'and' in filter && Array.isArray((filter as AndFilter).and);
}

/**
 * Check if filter is simple Filter
 */
function isSimpleFilter(filter: FilterExpression): filter is Filter {
  return 'field' in filter && 'operator' in filter;
}

/**
 * Determine if a field type should use case-insensitive matching
 */
function shouldBeCaseInsensitive(fieldType: FieldType, operator: Operator): boolean {
  if (fieldType !== 'String') return false;
  const stringOps: Operator[] = ['equals', 'contains', 'startsWith', 'endsWith'];
  return stringOps.includes(operator);
}

// ============================================================================
// OPERATOR CONVERSION
// ============================================================================

/**
 * Convert PATAY operator to Prisma format
 */
function convertOperator(
  operator: Operator,
  value: unknown,
  fieldType: FieldType,
  caseInsensitive: boolean
): unknown {
  // Handle null values
  if (value === null) {
    return operator === 'not' ? { not: null } : null;
  }

  // Build the condition based on operator
  switch (operator) {
    case 'equals':
      if (fieldType === 'String' && caseInsensitive) {
        return { equals: value, mode: 'insensitive' };
      }
      return value;

    case 'not':
      // NOTE: Prisma's NestedStringFilter doesn't support 'mode'.
      // For case-insensitive NOT, use filter.not=true with operator='equals'
      // which triggers top-level NOT in buildSingleWhere.
      return { not: value };

    case 'contains':
      if (caseInsensitive) {
        return { contains: value, mode: 'insensitive' };
      }
      return { contains: value };

    case 'startsWith':
      if (caseInsensitive) {
        return { startsWith: value, mode: 'insensitive' };
      }
      return { startsWith: value };

    case 'endsWith':
      if (caseInsensitive) {
        return { endsWith: value, mode: 'insensitive' };
      }
      return { endsWith: value };

    case 'gt':
      return { gt: value };

    case 'gte':
      return { gte: value };

    case 'lt':
      return { lt: value };

    case 'lte':
      return { lte: value };

    case 'has':
      return { has: value };

    case 'hasEvery':
      return { hasEvery: value };

    case 'hasSome':
      return { hasSome: value };

    case 'isEmpty':
      return { isEmpty: value };

    case 'some':
      return { some: value };

    case 'every':
      return { every: value };

    case 'none':
      return { none: value };

    case 'is':
      return { is: value };

    case 'isNot':
      return { isNot: value };

    default:
      return value;
  }
}

// ============================================================================
// PATH BUILDING
// ============================================================================

/**
 * Build a nested object for a field path
 * e.g., "author.country.name" -> { author: { country: { name: value } } }
 */
function buildNestedPath(segments: string[], value: unknown): PrismaWhere {
  if (segments.length === 1) {
    return { [segments[0]]: value };
  }

  const [first, ...rest] = segments;
  return { [first]: buildNestedPath(rest, value) };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build Prisma WHERE from a single filter
 */
export function buildSingleWhere(
  filter: Filter,
  resolvedPath: ResolvedFieldPath,
  options: WhereBuilderOptions = {}
): PrismaWhere {
  const { defaultCaseInsensitive = true } = options;
  const { segments, field } = resolvedPath;

  // Determine case sensitivity
  const useCaseInsensitive =
    filter.mode === 'insensitive' ||
    (filter.mode !== 'default' &&
      defaultCaseInsensitive &&
      shouldBeCaseInsensitive(field.type, filter.operator));

  // Convert operator to Prisma format
  const prismaValue = convertOperator(
    filter.operator,
    filter.value,
    field.type,
    useCaseInsensitive
  );

  // Apply NOT if specified
  const finalValue = filter.not
    ? { NOT: buildNestedPath(segments, prismaValue) }
    : buildNestedPath(segments, prismaValue);

  // If the path has a single segment, return directly
  if (typeof finalValue === 'object' && 'NOT' in finalValue) {
    return finalValue as PrismaWhere;
  }

  return finalValue;
}

/**
 * Build Prisma WHERE from a filter expression
 */
export function buildWhereExpression(
  filter: FilterExpression,
  resolvedFields: Map<string, ResolvedFieldPath>,
  options: WhereBuilderOptions = {}
): PrismaWhere {
  // Handle simple filter
  if (isSimpleFilter(filter)) {
    const resolved = resolvedFields.get(filter.field);
    if (!resolved) {
      throw new Error(`No resolved path for field: ${filter.field}`);
    }
    return buildSingleWhere(filter, resolved, options);
  }

  // Handle OR filter
  if (isOrFilter(filter)) {
    const orConditions = filter.or.map(subFilter => {
      const resolved = resolvedFields.get(subFilter.field);
      if (!resolved) {
        throw new Error(`No resolved path for field: ${subFilter.field}`);
      }
      return buildSingleWhere(subFilter, resolved, options);
    });
    return { OR: orConditions };
  }

  // Handle AND filter
  if (isAndFilter(filter)) {
    const andConditions = filter.and.map(subFilter =>
      buildWhereExpression(subFilter, resolvedFields, options)
    );
    return { AND: andConditions };
  }

  throw new Error('Invalid filter expression');
}

/**
 * Build complete Prisma WHERE from array of filters
 */
export function buildWhere(
  filters: FilterExpression[],
  resolvedFields: Map<string, ResolvedFieldPath>,
  options: WhereBuilderOptions = {}
): PrismaWhere {
  if (filters.length === 0) {
    // Return tenant filter if provided
    if (options.tenantId) {
      return { tenantId: options.tenantId };
    }
    return {};
  }

  const conditions = filters.map(f =>
    buildWhereExpression(f, resolvedFields, options)
  );

  // Merge with tenant filter if provided
  const baseWhere = conditions.length === 1 ? conditions[0] : { AND: conditions };

  if (options.tenantId) {
    return { AND: [{ tenantId: options.tenantId }, baseWhere] };
  }

  return baseWhere;
}

/**
 * Merge multiple WHERE clauses
 */
export function mergeWhere(...clauses: PrismaWhere[]): PrismaWhere {
  const nonEmpty = clauses.filter(c => Object.keys(c).length > 0);

  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];

  return { AND: nonEmpty };
}
