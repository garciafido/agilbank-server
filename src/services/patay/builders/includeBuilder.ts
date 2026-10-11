/**
 * PATAY Builders - Include Builder
 *
 * Builds Prisma INCLUDE clauses for relation loading.
 * Handles nested includes, filtering, and pagination.
 */

import { EntityInfo, Include, SchemaInfo, Filter, OrderBy, FieldInfo } from '../tools/types';
import { buildWhere, PrismaWhere, WhereBuilderOptions } from './whereBuilder';
import { validateFilters, ResolvedFieldPath } from '../validators/filterValidator';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prisma-compatible include clause
 */
export type PrismaInclude = Record<string, boolean | PrismaIncludeOptions>;

export interface PrismaIncludeOptions {
  where?: PrismaWhere;
  orderBy?: PrismaOrderBy;
  take?: number;
  skip?: number;
  include?: PrismaInclude;
  select?: Record<string, boolean>;
}

export type PrismaOrderBy = Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;

/**
 * Options for building includes
 */
export interface IncludeBuilderOptions extends WhereBuilderOptions {
  /** Maximum depth for nested includes (default: 3) */
  maxDepth?: number;

  /** Default take for array relations (default: 10) */
  defaultTake?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Find relation field info
 */
function findRelationField(entity: EntityInfo, relationName: string): FieldInfo | undefined {
  return entity.fields.find(
    f => f.isRelation && f.name.toLowerCase() === relationName.toLowerCase()
  );
}

/**
 * Get target entity for relation
 */
function getTargetEntity(
  schema: SchemaInfo,
  relationField: FieldInfo
): EntityInfo | undefined {
  if (!relationField.relationEntity) return undefined;
  return schema.entities.find(e => e.name === relationField.relationEntity);
}

/**
 * Build order by clause
 */
function buildOrderBy(orderBy?: OrderBy): PrismaOrderBy | undefined {
  if (!orderBy) return undefined;
  return { [orderBy.field]: orderBy.direction };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build Prisma INCLUDE from a single Include specification
 */
export function buildSingleInclude(
  schema: SchemaInfo,
  entity: EntityInfo,
  include: Include,
  options: IncludeBuilderOptions = {},
  depth: number = 0
): PrismaIncludeOptions | boolean {
  const { maxDepth = 3, defaultTake = 10 } = options;

  // Find the relation field
  const relationField = findRelationField(entity, include.relation);
  if (!relationField) {
    // Relation doesn't exist - return simple include
    // Validation should have caught this
    return true;
  }

  // Get target entity
  const targetEntity = getTargetEntity(schema, relationField);
  if (!targetEntity) {
    return true;
  }

  // Build include options
  const includeOptions: PrismaIncludeOptions = {};

  // Build where clause if filters provided
  if (include.where && include.where.length > 0) {
    const filterResult = validateFilters(
      schema,
      targetEntity,
      include.where as any
    );

    if (filterResult.success) {
      includeOptions.where = buildWhere(
        include.where,
        filterResult.data.resolvedFields,
        options
      );
    }
  }

  // Add order by
  if (include.orderBy) {
    includeOptions.orderBy = buildOrderBy(include.orderBy);
  }

  // Add take (limit) for array relations
  if (relationField.isArray) {
    includeOptions.take = include.take ?? defaultTake;
  }

  // Build nested includes (with depth check)
  if (include.include && include.include.length > 0 && depth < maxDepth) {
    const nestedInclude = buildInclude(
      schema,
      targetEntity,
      include.include,
      options,
      depth + 1
    );
    if (nestedInclude && Object.keys(nestedInclude).length > 0) {
      includeOptions.include = nestedInclude;
    }
  }

  // Return simple true if no options
  if (Object.keys(includeOptions).length === 0) {
    return true;
  }

  return includeOptions;
}

/**
 * Build Prisma INCLUDE from array of Include specifications
 */
export function buildInclude(
  schema: SchemaInfo,
  entity: EntityInfo,
  includes?: Include[],
  options: IncludeBuilderOptions = {},
  depth: number = 0
): PrismaInclude | undefined {
  if (!includes || includes.length === 0) {
    return undefined;
  }

  const prismaInclude: PrismaInclude = {};

  for (const include of includes) {
    const relationField = findRelationField(entity, include.relation);
    if (!relationField) {
      // Skip unknown relations
      continue;
    }

    prismaInclude[relationField.name] = buildSingleInclude(
      schema,
      entity,
      include,
      options,
      depth
    );
  }

  return Object.keys(prismaInclude).length > 0 ? prismaInclude : undefined;
}

/**
 * Build simple include (just relation names, no options)
 */
export function buildSimpleInclude(relationNames: string[]): PrismaInclude {
  const include: PrismaInclude = {};
  for (const name of relationNames) {
    include[name] = true;
  }
  return include;
}

/**
 * Merge multiple include clauses
 */
export function mergeInclude(
  ...includes: (PrismaInclude | undefined)[]
): PrismaInclude | undefined {
  const nonEmpty = includes.filter((i): i is PrismaInclude => i !== undefined);

  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];

  const merged: PrismaInclude = {};
  for (const include of nonEmpty) {
    for (const [key, value] of Object.entries(include)) {
      if (typeof value === 'boolean') {
        // Simple include - just set to true
        if (!merged[key] || merged[key] === true) {
          merged[key] = value;
        }
      } else {
        // Include with options - merge
        const existing = merged[key];
        if (!existing || existing === true) {
          merged[key] = value;
        } else {
          // Both have options - merge them
          merged[key] = {
            ...(existing as PrismaIncludeOptions),
            ...value,
          };
        }
      }
    }
  }

  return merged;
}

/**
 * Get all relation names for an entity
 */
export function getRelationNames(entity: EntityInfo): string[] {
  return entity.fields
    .filter(f => f.isRelation)
    .map(f => f.name);
}

/**
 * Validate include relations exist
 * Returns list of invalid relation names
 */
export function validateIncludeRelations(
  entity: EntityInfo,
  includes: Include[]
): string[] {
  const validRelations = new Set(
    entity.fields.filter(f => f.isRelation).map(f => f.name.toLowerCase())
  );

  return includes
    .filter(i => !validRelations.has(i.relation.toLowerCase()))
    .map(i => i.relation);
}
