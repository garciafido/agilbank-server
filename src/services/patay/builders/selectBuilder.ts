/**
 * PATAY Builders - Select Builder
 *
 * Builds Prisma SELECT clauses for field selection.
 * Handles explicit field selection and default fields.
 */

import { EntityInfo, FieldInfo } from '../tools/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prisma-compatible select clause
 */
export type PrismaSelect = Record<string, boolean | PrismaSelect>;

/**
 * Options for building select clauses
 */
export interface SelectBuilderOptions {
  /** Include ID fields always (default: true) */
  includeIdFields?: boolean;

  /** Include audit fields (createdAt, updatedAt) */
  includeAuditFields?: boolean;

  /** Exclude internal fields (ending with _) */
  excludeInternalFields?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if field is an ID field
 */
function isIdField(field: FieldInfo): boolean {
  return field.name === 'id' || field.name.endsWith('Id');
}

/**
 * Check if field is an audit field
 */
function isAuditField(field: FieldInfo): boolean {
  const auditFields = ['createdAt', 'updatedAt', 'createdAt_', 'updatedAt_'];
  return auditFields.includes(field.name);
}

/**
 * Check if field is internal (ends with _)
 */
function isInternalField(field: FieldInfo): boolean {
  return field.name.endsWith('_');
}

/**
 * Get default selectable fields for an entity
 */
export function getDefaultSelectableFields(
  entity: EntityInfo,
  options: SelectBuilderOptions = {}
): string[] {
  const {
    includeIdFields = true,
    includeAuditFields = false,
    excludeInternalFields = true,
  } = options;

  return entity.fields
    .filter(field => {
      // Always exclude relations (they need include, not select)
      if (field.isRelation) return false;

      // Apply options
      if (!includeIdFields && isIdField(field)) return false;
      if (!includeAuditFields && isAuditField(field)) return false;
      if (excludeInternalFields && isInternalField(field)) return false;

      return true;
    })
    .map(f => f.name);
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build Prisma SELECT from explicit field list
 *
 * If no fields specified, returns undefined (select all)
 */
export function buildSelect(
  entity: EntityInfo,
  fields?: string[],
  options: SelectBuilderOptions = {}
): PrismaSelect | undefined {
  if (!fields || fields.length === 0) {
    // No explicit fields - let Prisma select all non-relation fields
    return undefined;
  }

  const { includeIdFields = true } = options;
  const select: PrismaSelect = {};

  // Always include ID if option is true
  if (includeIdFields && !fields.includes('id')) {
    select.id = true;
  }

  // Add requested fields
  for (const fieldName of fields) {
    const field = entity.fields.find(f => f.name === fieldName);

    if (!field) {
      // Field doesn't exist - skip silently
      // Validation should have caught this earlier
      continue;
    }

    if (field.isRelation) {
      // Relations require include, not select
      // This will be handled separately
      continue;
    }

    select[fieldName] = true;
  }

  return Object.keys(select).length > 0 ? select : undefined;
}

/**
 * Build minimal select for count/aggregate operations
 * Only selects ID for efficiency
 */
export function buildMinimalSelect(): PrismaSelect {
  return { id: true };
}

/**
 * Build select that includes display fields for an entity
 * Used when returning entity references
 */
export function buildDisplaySelect(entity: EntityInfo): PrismaSelect {
  const select: PrismaSelect = { id: true };

  // Include common display fields
  const displayFields = ['name', 'title', 'label', 'code', 'displayId'];
  for (const fieldName of displayFields) {
    const field = entity.fields.find(f => f.name === fieldName);
    if (field && !field.isRelation) {
      select[fieldName] = true;
    }
  }

  return select;
}

/**
 * Merge multiple select clauses
 */
export function mergeSelect(...selects: (PrismaSelect | undefined)[]): PrismaSelect | undefined {
  const nonEmpty = selects.filter((s): s is PrismaSelect => s !== undefined);

  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];

  const merged: PrismaSelect = {};
  for (const select of nonEmpty) {
    for (const [key, value] of Object.entries(select)) {
      if (typeof value === 'boolean') {
        merged[key] = value;
      } else {
        // Nested select - merge recursively
        merged[key] = mergeSelect(
          merged[key] as PrismaSelect | undefined,
          value
        ) as PrismaSelect;
      }
    }
  }

  return merged;
}

/**
 * Validate field names against entity
 * Returns list of invalid field names
 */
export function validateFieldNames(
  entity: EntityInfo,
  fields: string[]
): string[] {
  const validNames = new Set(entity.fields.map(f => f.name));
  return fields.filter(f => !validNames.has(f));
}
