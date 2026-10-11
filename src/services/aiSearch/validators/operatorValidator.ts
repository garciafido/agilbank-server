/**
 * Operator Validator
 *
 * Validates filter operators against field types.
 * Extracted from entityQueryTool.ts and aggregationTool.ts to avoid duplication.
 */

/**
 * Valid operators by field type.
 * Text operators (contains, startsWith, endsWith) only work on String.
 * Comparison operators (gt, lt, gte, lte) work on numbers and dates.
 */
export const VALID_OPERATORS_BY_TYPE: Record<string, Set<string>> = {
  // String - supports text operators
  'String': new Set(['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'in', 'notIn', 'isNull', 'isNotNull']),
  // Numbers - NO text operators
  'Int': new Set(['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull']),
  'Float': new Set(['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull']),
  'Decimal': new Set(['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull']),
  // DateTime - text operators converted to date ranges (handled elsewhere)
  'DateTime': new Set(['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull', 'contains', 'startsWith']),
  'Date': new Set(['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull', 'contains', 'startsWith']),
  // Boolean
  'Boolean': new Set(['equals', 'notEquals', 'isNull', 'isNotNull']),
};

/**
 * Valid operators for the special 'id' field (UUID).
 * id is a UUID string, so gt/lt/contains don't make semantic sense.
 */
export const VALID_ID_OPERATORS = new Set(['equals', 'notEquals', 'in', 'notIn', 'isNull', 'isNotNull']);

/**
 * Valid operators for relation field filters.
 * Relation filters compare against the target entity's display field (typically String).
 * Numeric operators (gt, lt, gte, lte) are not allowed - use having with countRelation instead.
 */
export const VALID_RELATION_OPERATORS = new Set([
  'equals', 'notEquals', 'contains', 'notContains',
  'startsWith', 'endsWith', 'in', 'notIn', 'isNull', 'isNotNull'
]);

/**
 * Validate if an operator is compatible with a field type.
 * Returns error message if incompatible, null if valid.
 * @param fieldName - The field name being filtered
 * @param fieldType - The Prisma/GraphQL type of the field
 * @param operator - The filter operator
 * @param isRelationField - If true, validates against VALID_RELATION_OPERATORS
 */
export function validateOperatorForType(
  fieldName: string,
  fieldType: string,
  operator: string,
  isRelationField: boolean = false
): string | null {
  // For relation fields, only text-compatible operators are valid
  // Numeric operators (gt, lt, gte, lte) should use having with countRelation
  if (isRelationField) {
    if (!VALID_RELATION_OPERATORS.has(operator)) {
      return `Operador '${operator}' no válido para campo relación '${fieldName}'. ` +
             `Los filtros de relación comparan texto (nombre/título de la entidad relacionada). ` +
             `Para filtrar por cantidad de items, use having con countRelation en count_entities. ` +
             `Operadores válidos para relaciones: ${Array.from(VALID_RELATION_OPERATORS).join(', ')}`;
    }
    return null;
  }

  // Special validation for 'id' field - it's a UUID, not a sequential number
  if (fieldName === 'id') {
    if (!VALID_ID_OPERATORS.has(operator)) {
      return `Operador '${operator}' no válido para campo 'id'. El id es un UUID (texto), no un número secuencial. Operadores válidos: equals, in, isNull, isNotNull. No se puede usar gt/lt/gte/lte/contains en UUIDs.`;
    }
    return null;
  }

  const validOps = VALID_OPERATORS_BY_TYPE[fieldType];

  // Unknown type or relation - let other validation handle it
  if (!validOps) {
    return null;
  }

  if (!validOps.has(operator)) {
    const textOps = ['contains', 'notContains', 'startsWith', 'endsWith'];
    if (textOps.includes(operator)) {
      return `Operador '${operator}' no válido para '${fieldName}' (tipo ${fieldType}). '${operator}' solo funciona en campos de texto (String). Use 'equals', 'gt', 'lt', 'gte', 'lte' para ${fieldType}.`;
    }
    return `Operador '${operator}' no válido para tipo ${fieldType}. Operadores válidos: ${Array.from(validOps).join(', ')}`;
  }

  return null;
}

/**
 * Normalize temporal field names by adding underscore suffix.
 * LLMs sometimes omit the underscore from internal fields like createdAt_ and updatedAt_.
 */
export function normalizeTemporalField(fieldPath: string): string {
  return fieldPath
    .replace(/\.createdAt$/, '.createdAt_')
    .replace(/\.updatedAt$/, '.updatedAt_')
    .replace(/^createdAt$/, 'createdAt_')
    .replace(/^updatedAt$/, 'updatedAt_');
}
