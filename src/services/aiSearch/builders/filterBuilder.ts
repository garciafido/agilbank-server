/**
 * Filter Builder
 *
 * Builds Prisma where conditions from simplified filter specifications.
 * Extracted from entityQueryTool.ts and aggregationTool.ts to avoid duplication.
 */

/**
 * Parse a value for in/notIn operators.
 * Handles both actual arrays and stringified JSON arrays (LLM sometimes sends these).
 *
 * Examples:
 * - ["a", "b"] -> ["a", "b"]           (already an array)
 * - '["a", "b"]' -> ["a", "b"]         (stringified JSON array)
 * - "single" -> ["single"]             (single value wrapped in array)
 */
function parseArrayValue(value: unknown): unknown[] {
  // Already an array
  if (Array.isArray(value)) {
    return value;
  }

  // String that looks like a JSON array
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Not valid JSON, treat as single value
      }
    }
    // Single string value
    return [value];
  }

  // Other types: wrap in array
  return [value];
}

/**
 * Build Prisma where condition from simplified filter operator and value.
 *
 * Converts AI-friendly operators to Prisma query format.
 *
 * @param operator - The filter operator (equals, contains, gt, etc.)
 * @param value - The value to filter by
 * @returns Prisma-compatible condition object
 */
export function buildPrismaCondition(operator: string, value: unknown): unknown {
  switch (operator) {
    case 'equals':
      return value;
    case 'notEquals':
      // Handle null specially
      // For scalar fields: { not: null } works
      // For relation fields: caller should use { isNot: null } directly
      if (value === null) {
        return { not: null };
      }
      return { not: value };
    case 'contains':
      return { contains: value, mode: 'insensitive' };
    case 'notContains':
      // NOTE: Prisma's NestedStringFilter doesn't support 'mode'.
      // For case-insensitive NOT, use top-level NOT: { field: { contains, mode } }
      // Here we use case-sensitive as fallback since we can't restructure the query.
      return { not: { contains: value } };
    case 'startsWith':
      return { startsWith: value, mode: 'insensitive' };
    case 'endsWith':
      return { endsWith: value, mode: 'insensitive' };
    case 'gt':
      return { gt: value };
    case 'lt':
      return { lt: value };
    case 'gte':
      return { gte: value };
    case 'lte':
      return { lte: value };
    case 'in':
      return { in: parseArrayValue(value) };
    case 'notIn':
      return { notIn: parseArrayValue(value) };
    case 'isNull':
      return null;
    case 'isNotNull':
      // For scalar fields: { not: null } or { not: { equals: null } }
      // For relation fields: caller should use { isNot: null } directly
      // We default to scalar behavior since it's more common
      return { not: null };
    default:
      return value;
  }
}

/**
 * Sanitize a Prisma where clause to fix common LLM-generated issues.
 *
 * Fixes:
 * - { some/every/none: { id: null } } -> { some/every/none: {} }
 * - { some/every/none: { id: { not: null } } } -> { some/every/none: {} }
 * - { some/every/none: { fieldName: null } } -> { some/every/none: {} }
 * - { relation: { id: null } } -> { relation: null } (for "no relation" checks)
 * - { AND: { 0: {...}, 1: {...} } } -> { AND: [{...}, {...}] } (object to array)
 * - { OR: { 0: {...}, 1: {...} } } -> { OR: [{...}, {...}] } (object to array)
 *
 * These patterns are invalid in Prisma but LLMs commonly generate them
 * when trying to express "has/doesn't have related items".
 */
export function sanitizeWhereClause(where: Record<string, unknown>): Record<string, unknown> {
  if (!where || typeof where !== 'object') {
    return where;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(where)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      // Preserve primitives and arrays as-is
      // (arrays are typeof 'object' in JS but shouldn't be recursively processed)
      result[key] = value;
      continue;
    }

    const objValue = value as Record<string, unknown>;

    // Fix 3: Convert AND/OR objects with numeric keys to arrays
    // LLM sometimes generates { AND: { 0: {...}, 1: {...} } } instead of { AND: [...] }
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      if (!Array.isArray(objValue)) {
        const keys = Object.keys(objValue);
        const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
        if (allNumeric) {
          // Convert object with numeric keys to array
          const arrayValue = keys
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(k => objValue[k])
            .filter(item => item !== null && item !== undefined)
            .map(item =>
              typeof item === 'object' && item !== null
                ? sanitizeWhereClause(item as Record<string, unknown>)
                : item
            );
          result[key] = arrayValue;
          continue;
        }
      }
    }

    // Check for relation filter patterns: some, every, none
    if ('some' in objValue || 'every' in objValue || 'none' in objValue) {
      const sanitizedRelation: Record<string, unknown> = {};

      for (const [relKey, relValue] of Object.entries(objValue)) {
        if (relKey === 'some' || relKey === 'every' || relKey === 'none') {
          if (relValue && typeof relValue === 'object') {
            const innerObj = relValue as Record<string, unknown>;

            // Check for problematic patterns
            const sanitizedInner = sanitizeRelationFilter(innerObj);
            sanitizedRelation[relKey] = sanitizedInner;
          } else {
            sanitizedRelation[relKey] = relValue;
          }
        } else {
          sanitizedRelation[relKey] = relValue;
        }
      }

      result[key] = sanitizedRelation;
    } else if (Array.isArray(value)) {
      // Handle AND/OR arrays
      result[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? sanitizeWhereClause(item as Record<string, unknown>)
          : item
      );
    } else {
      // Fix 1: Check for { relation: { id: null } } pattern
      // This means "where relation is null" - convert to { relation: null }
      if ('id' in objValue && objValue.id === null && Object.keys(objValue).length === 1) {
        result[key] = null;
        continue;
      }

      // Recursively sanitize nested objects
      result[key] = sanitizeWhereClause(objValue);
    }
  }

  return result;
}

/**
 * Check if a filter object tree only contains no-op PK not-null checks.
 * These are no-ops inside some/every/none context since non-nullable PK fields always pass.
 */
function isNotNullOnlyFilter(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return false;

    const inner = value as Record<string, unknown>;

    if ('not' in inner && inner.not === null && Object.keys(inner).length === 1) {
      if (key === 'id' || key.endsWith('Id') || key.endsWith('_id')) continue;
      return false;
    }

    if (!isNotNullOnlyFilter(inner)) return false;
  }
  return true;
}

/**
 * Sanitize the inner part of a relation filter (inside some/every/none).
 * Fixes patterns like { id: null } or { id: { not: null } } that Prisma rejects.
 */
function sanitizeRelationFilter(filter: Record<string, unknown>): Record<string, unknown> {
  if (!filter || typeof filter !== 'object') {
    return filter;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    // Skip null values on id or other fields - these are invalid in Prisma
    if (value === null) {
      // { id: null } or { fieldName: null } inside some/every/none is invalid
      // Skip this condition - an empty filter {} means "any record exists"
      continue;
    }

    // Check for problematic object patterns (but preserve arrays)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const objValue = value as Record<string, unknown>;

      // { id: { not: null } } -> skip, empty {} means "exists"
      if ('not' in objValue && objValue.not === null && Object.keys(objValue).length === 1) {
        continue;
      }

      // Fix 2: { field: { isNot: null } } on scalar fields is invalid
      // Convert to { field: { not: null } } which works for scalars
      if ('isNot' in objValue && objValue.isNot === null && Object.keys(objValue).length === 1) {
        result[key] = { not: null };
        continue;
      }

      // Other nested objects should be sanitized recursively
      const sanitized = sanitizeWhereClause(objValue);
      // Nested filters that only check {not: null} on PKs are no-ops in some/every/none
      if (typeof sanitized === 'object' && sanitized !== null && isNotNullOnlyFilter(sanitized as Record<string, unknown>)) {
        continue;
      }
      result[key] = sanitized;
    } else {
      result[key] = value;
    }
  }

  // If no valid conditions remain, return empty object
  // Empty {} in some/every/none means "any/all/no records exist"
  return result;
}
