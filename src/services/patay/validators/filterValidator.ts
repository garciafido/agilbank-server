/**
 * PATAY Validators - Filter Validator
 *
 * Validates filter expressions against entity schema.
 * Handles field paths, operator compatibility, and value types.
 */

import {
  EntityInfo,
  FieldInfo,
  Filter,
  FilterExpression,
  OrFilter,
  AndFilter,
  ToolResult,
  ToolValidationError,
  FieldNotFoundError,
  Lang,
  SchemaInfo,
} from '../tools/types';
import { isOperatorValidForType, getOperatorsForType } from '../tools/operators';

// ============================================================================
// TYPES
// ============================================================================

export interface FilterValidationResult {
  /** Validated filter ready for Prisma conversion */
  filter: FilterExpression;

  /** Resolved field info for each field path */
  resolvedFields: Map<string, ResolvedFieldPath>;
}

export interface ResolvedFieldPath {
  /** Original path string */
  path: string;

  /** Segments of the path */
  segments: string[];

  /** Final field info */
  field: FieldInfo;

  /** Entity containing the final field */
  entity: EntityInfo;

  /** Intermediate relations (for nested paths) */
  relations: Array<{
    fieldName: string;
    targetEntity: EntityInfo;
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize string for comparison
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

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

// ============================================================================
// FIELD RESOLUTION
// ============================================================================

/**
 * Find field by name in entity (case-insensitive)
 */
export function findField(entity: EntityInfo, fieldName: string): FieldInfo | undefined {
  const normalized = normalize(fieldName);
  return entity.fields.find(f => normalize(f.name) === normalized);
}

/**
 * Find field by label in entity (multilingual)
 */
export function findFieldByLabel(
  entity: EntityInfo,
  label: string,
  lang?: Lang
): FieldInfo | undefined {
  const normalized = normalize(label);

  for (const field of entity.fields) {
    if (!field.labels) continue;

    const langsToCheck: Lang[] = lang ? [lang] : ['es', 'en', 'pt'];

    for (const l of langsToCheck) {
      const labels = field.labels[l];
      if (!labels) continue;

      const singular = labels.s ? normalize(labels.s) : '';
      const plural = labels.p ? normalize(labels.p) : '';

      if (singular === normalized || plural === normalized) {
        return field;
      }
    }
  }

  return undefined;
}

/**
 * Resolve a field path like "author.country.name"
 *
 * Returns the resolved path info or an error.
 */
export function resolveFieldPath(
  schema: SchemaInfo,
  startEntity: EntityInfo,
  fieldPath: string,
  lang?: Lang
): ToolResult<ResolvedFieldPath> {
  const segments = fieldPath.split('.');
  let currentEntity = startEntity;
  const relations: ResolvedFieldPath['relations'] = [];

  // Navigate through intermediate relations
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    // Find the relation field
    let field = findField(currentEntity, segment);
    if (!field) {
      field = findFieldByLabel(currentEntity, segment, lang);
    }

    if (!field) {
      const error: FieldNotFoundError = {
        code: 'FIELD_NOT_FOUND',
        entity: currentEntity.name,
        field: segment,
        availableFields: currentEntity.fields
          .filter(f => f.isRelation)
          .map(f => f.name)
          .slice(0, 5),
      };
      return { success: false, error };
    }

    if (!field.isRelation || !field.relationEntity) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: segment,
        message: `Field "${segment}" is not a relation, cannot navigate through it`,
        suggestion: `Available relations: ${currentEntity.fields
          .filter(f => f.isRelation)
          .map(f => f.name)
          .join(', ')}`,
      };
      return { success: false, error };
    }

    // Find target entity
    const targetEntity = schema.entities.find(e => e.name === field.relationEntity);
    if (!targetEntity) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: segment,
        message: `Relation "${segment}" points to unknown entity "${field.relationEntity}"`,
      };
      return { success: false, error };
    }

    relations.push({
      fieldName: field.name,
      targetEntity,
    });

    currentEntity = targetEntity;
  }

  // Resolve final field
  const finalSegment = segments[segments.length - 1];
  let finalField = findField(currentEntity, finalSegment);
  if (!finalField) {
    finalField = findFieldByLabel(currentEntity, finalSegment, lang);
  }

  if (!finalField) {
    const error: FieldNotFoundError = {
      code: 'FIELD_NOT_FOUND',
      entity: currentEntity.name,
      field: finalSegment,
      availableFields: currentEntity.fields.map(f => f.name).slice(0, 10),
    };
    return { success: false, error };
  }

  return {
    success: true,
    data: {
      path: fieldPath,
      segments,
      field: finalField,
      entity: currentEntity,
      relations,
    },
  };
}

// ============================================================================
// FILTER VALIDATION
// ============================================================================

/**
 * Validate a single filter
 */
export function validateSingleFilter(
  schema: SchemaInfo,
  entity: EntityInfo,
  filter: Filter,
  lang?: Lang
): ToolResult<{ filter: Filter; resolvedField: ResolvedFieldPath }> {
  // Resolve field path
  const fieldResult = resolveFieldPath(schema, entity, filter.field, lang);
  if (!fieldResult.success) {
    return fieldResult as ToolResult<{ filter: Filter; resolvedField: ResolvedFieldPath }>;
  }

  const resolvedField = fieldResult.data;
  const fieldInfo = resolvedField.field;

  // Validate operator for field type
  if (!isOperatorValidForType(filter.operator, fieldInfo.type)) {
    const validOperators = getOperatorsForType(fieldInfo.type);
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      field: filter.field,
      message: `Operator "${filter.operator}" is not valid for field type "${fieldInfo.type}"`,
      suggestion: `Valid operators for ${fieldInfo.type}: ${validOperators.join(', ')}`,
    };
    return { success: false, error };
  }

  // Validate enum values
  if (fieldInfo.isEnum && filter.value !== null && filter.value !== undefined) {
    const value = String(filter.value);
    if (fieldInfo.enumValues && !fieldInfo.enumValues.includes(value)) {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        field: filter.field,
        message: `Invalid enum value "${value}" for field "${filter.field}"`,
        suggestion: `Valid values: ${fieldInfo.enumValues.join(', ')}`,
      };
      return { success: false, error };
    }
  }

  return {
    success: true,
    data: {
      filter,
      resolvedField,
    },
  };
}

/**
 * Validate a filter expression (handles OR/AND/simple)
 */
export function validateFilterExpression(
  schema: SchemaInfo,
  entity: EntityInfo,
  filter: FilterExpression,
  lang?: Lang
): ToolResult<FilterValidationResult> {
  const resolvedFields = new Map<string, ResolvedFieldPath>();

  // Handle simple filter
  if (isSimpleFilter(filter)) {
    const result = validateSingleFilter(schema, entity, filter, lang);
    if (!result.success) {
      return result as ToolResult<FilterValidationResult>;
    }
    resolvedFields.set(filter.field, result.data.resolvedField);
    return {
      success: true,
      data: { filter, resolvedFields },
    };
  }

  // Handle OR filter
  if (isOrFilter(filter)) {
    for (const subFilter of filter.or) {
      const result = validateSingleFilter(schema, entity, subFilter, lang);
      if (!result.success) {
        return result as ToolResult<FilterValidationResult>;
      }
      resolvedFields.set(subFilter.field, result.data.resolvedField);
    }
    return {
      success: true,
      data: { filter, resolvedFields },
    };
  }

  // Handle AND filter
  if (isAndFilter(filter)) {
    for (const subFilter of filter.and) {
      const result = validateFilterExpression(schema, entity, subFilter, lang);
      if (!result.success) {
        return result as ToolResult<FilterValidationResult>;
      }
      // Merge resolved fields
      for (const [key, value] of result.data.resolvedFields) {
        resolvedFields.set(key, value);
      }
    }
    return {
      success: true,
      data: { filter, resolvedFields },
    };
  }

  const error: ToolValidationError = {
    code: 'VALIDATION_ERROR',
    message: 'Invalid filter format: must have field/operator, or, or and',
  };
  return { success: false, error };
}

/**
 * Validate an array of filters
 */
export function validateFilters(
  schema: SchemaInfo,
  entity: EntityInfo,
  filters: FilterExpression[],
  lang?: Lang
): ToolResult<{ filters: FilterExpression[]; resolvedFields: Map<string, ResolvedFieldPath> }> {
  const allResolvedFields = new Map<string, ResolvedFieldPath>();

  for (const filter of filters) {
    const result = validateFilterExpression(schema, entity, filter, lang);
    if (!result.success) {
      return result as ToolResult<{ filters: FilterExpression[]; resolvedFields: Map<string, ResolvedFieldPath> }>;
    }
    for (const [key, value] of result.data.resolvedFields) {
      allResolvedFields.set(key, value);
    }
  }

  return {
    success: true,
    data: {
      filters,
      resolvedFields: allResolvedFields,
    },
  };
}
