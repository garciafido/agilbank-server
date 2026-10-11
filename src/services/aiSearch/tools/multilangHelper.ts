/**
 * Multilang Field Resolution Helper
 *
 * Centralizes ALL multilang field handling for AI Search.
 * Converts between logical field names (for LLM) and Prisma column names (for queries).
 *
 * Architecture:
 * - displayFields: logical names for LLM (e.g., "name")
 * - multilangFields: indicates which fields need language suffix
 * - This helper handles ALL conversions in both directions
 *
 * Flow:
 *   LLM sees "name" → Tool resolves to "name_es" → Prisma query
 *   Prisma returns "name_es" → Tool maps back to "name" → LLM sees "name"
 */

import { SchemaMetadata, FieldMetadata, EntityMetadata } from '../security/types';

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Check if entity uses old format (displayFields already has _lang suffix)
 */
function usesOldFormat(entity: EntityMetadata): boolean {
  if (entity.multilangFields && entity.multilangFields.length > 0) {
    return false; // Has new format
  }
  return entity.displayFields?.some(df => /_(?:es|en|pt)$/.test(df)) ?? false;
}

/**
 * Check if a field is multilang in an entity
 */
function isMultilangField(fieldName: string, entity: EntityMetadata): boolean {
  // New format: check multilangFields array
  if (entity.multilangFields?.includes(fieldName)) {
    return true;
  }
  // Old format: check if displayFields has this field with _lang suffix
  if (entity.displayFields?.some(df => df.startsWith(`${fieldName}_`) && /_(?:es|en|pt)$/.test(df))) {
    return true;
  }
  return false;
}

/**
 * Extract base field name from Prisma column name
 * "name_es" → "name", "title" → "title"
 */
function extractBaseName(prismaFieldName: string): { baseName: string; language: string | null } {
  const match = prismaFieldName.match(/^(.+)_(es|en|pt)$/);
  if (match) {
    return { baseName: match[1], language: match[2] };
  }
  return { baseName: prismaFieldName, language: null };
}

// =============================================================================
// LOGICAL → PRISMA (for building queries)
// =============================================================================

/**
 * Resolve a logical field name to its Prisma column name
 * "name" + language="es" → "name_es" (if multilang)
 * "code" + language="es" → "code" (if not multilang)
 */
export function resolveToPrisma(
  logicalFieldName: string,
  entity: EntityMetadata,
  language: string
): string {
  if (isMultilangField(logicalFieldName, entity)) {
    return `${logicalFieldName}_${language}`;
  }
  return logicalFieldName;
}

/**
 * Resolve an array of logical field names to Prisma column names
 */
export function resolveFieldsToPrisma(
  logicalFieldNames: string[],
  entity: EntityMetadata,
  language: string
): string[] {
  return logicalFieldNames.map(f => resolveToPrisma(f, entity, language));
}

/**
 * Get displayFields resolved to Prisma column names
 */
export function getDisplayFieldsForPrisma(
  entity: EntityMetadata,
  language: string
): string[] {
  const displayFields = entity.displayFields || [];

  // Old format: displayFields already has Prisma column names
  if (usesOldFormat(entity)) {
    return displayFields;
  }

  // New format: resolve each field to Prisma column name
  return resolveFieldsToPrisma(displayFields, entity, language);
}

/**
 * Build a Prisma select object from logical field names
 */
export function buildPrismaSelect(
  logicalFields: string[],
  entity: EntityMetadata,
  language: string,
  includeId: boolean = true
): Record<string, boolean> {
  const select: Record<string, boolean> = {};

  if (includeId) {
    select.id = true;
  }

  const prismaFields = resolveFieldsToPrisma(logicalFields, entity, language);
  for (const field of prismaFields) {
    select[field] = true;
  }

  return select;
}

/**
 * Build a Prisma select object from entity's displayFields
 */
export function buildDisplayFieldsSelect(
  entity: EntityMetadata,
  language: string,
  includeId: boolean = true
): Record<string, boolean> {
  const select: Record<string, boolean> = {};

  if (includeId) {
    select.id = true;
  }

  const prismaFields = getDisplayFieldsForPrisma(entity, language);
  // Allowed internal fields (exposed in schema-metadata)
  const allowedInternalFields = new Set(['createdAt_', 'updatedAt_']);
  for (const field of prismaFields) {
    // Skip FK fields (like author_id) but allow id and allowed internal fields
    const isForeignKey = field.includes('_id');
    const isAllowedInternal = allowedInternalFields.has(field);
    const isInternalField = field.endsWith('_') && !isAllowedInternal;
    if (!isForeignKey && !isInternalField) {
      select[field] = true;
    }
  }

  return select;
}

// =============================================================================
// PRISMA → LOGICAL (for mapping results back to LLM)
// =============================================================================

/**
 * Resolve a Prisma column name back to its logical field name
 * "name_es" → "name" (if multilang and matches language)
 * "code" → "code" (if not multilang)
 */
export function resolveToLogical(
  prismaFieldName: string,
  entity: EntityMetadata,
  language: string
): string | null {
  const { baseName, language: fieldLang } = extractBaseName(prismaFieldName);

  // If it has a language suffix
  if (fieldLang) {
    // Only include if it matches the user's language
    if (fieldLang === language) {
      // Verify this is actually a multilang field
      if (isMultilangField(baseName, entity) || usesOldFormat(entity)) {
        return baseName;
      }
    }
    // Different language or not a recognized multilang field - exclude
    return null;
  }

  // No language suffix - return as-is
  return prismaFieldName;
}

/**
 * Map a Prisma result record to logical field names
 * { name_es: "Argentina", code: "AR" } → { name: "Argentina", code: "AR" }
 */
export function mapResultToLogical(
  record: Record<string, unknown>,
  entity: EntityMetadata,
  language: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Allowed internal fields (exposed in schema-metadata)
  const allowedInternalFields = new Set(['createdAt_', 'updatedAt_']);

  for (const [key, value] of Object.entries(record)) {
    // Skip FK fields and non-allowed internal fields
    const isForeignKey = key.endsWith('_id');
    const isAllowedInternal = allowedInternalFields.has(key);
    const isInternalField = key.endsWith('_') && !isAllowedInternal;
    if (isForeignKey || isInternalField) {
      continue;
    }

    // For allowed internal fields, keep as-is
    if (isAllowedInternal) {
      result[key] = value;
      continue;
    }

    const logicalName = resolveToLogical(key, entity, language);
    if (logicalName !== null) {
      result[logicalName] = value;
    }
  }

  return result;
}

/**
 * Map an array of Prisma result records to logical field names
 */
export function mapResultsToLogical(
  records: Array<Record<string, unknown>>,
  entity: EntityMetadata,
  language: string
): Array<Record<string, unknown>> {
  return records.map(r => mapResultToLogical(r, entity, language));
}

// =============================================================================
// RELATION HELPERS (for WHERE clauses with relations)
// =============================================================================

/**
 * Get the filter field for a relation (for WHERE clauses)
 * Returns the Prisma column name to use when filtering by a relation.
 * IMPORTANT: Only returns STRING fields since text operators (contains, etc.) only work on strings.
 */
export function getRelationFilterField(
  targetEntity: EntityMetadata | undefined,
  language: string
): string {
  if (!targetEntity) {
    return 'name';
  }

  // Filter displayFields to only include STRING fields
  // - Must be type 'String'
  // - Must NOT be a relation (no targetEntity)
  const stringDisplayFields = targetEntity.displayFields?.filter(df => {
    const fieldMeta = targetEntity.fields.find(f => f.name === df);
    return fieldMeta && fieldMeta.type === 'String' && !fieldMeta.targetEntity;
  });

  // If we found String fields in displayFields
  if (stringDisplayFields && stringDisplayFields.length > 0) {
    const logicalField = stringDisplayFields[0];
    // Check if it's multilang and resolve to Prisma column name
    if (targetEntity.multilangFields?.includes(logicalField)) {
      return resolveToPrisma(logicalField, targetEntity, language);
    }
    return logicalField;
  }

  // Fallback: search for ANY String field in the entity
  const anyStringField = targetEntity.fields.find(
    f => f.type === 'String' && !f.targetEntity
  );
  if (anyStringField) {
    if (targetEntity.multilangFields?.includes(anyStringField.name)) {
      return resolveToPrisma(anyStringField.name, targetEntity, language);
    }
    return anyStringField.name;
  }

  // Last resort fallback
  return 'name';
}

/**
 * Resolve a dot-notation field path to the final Prisma field name
 * "author.nationality.name" → "name_es" (if name is multilang in Country)
 */
export function resolveFieldPath(
  fieldPath: string[],
  startFieldsMap: Map<string, FieldMetadata>,
  schemaMetadata: SchemaMetadata,
  language: string
): string {
  let currentFieldsMap = startFieldsMap;
  let targetEntity: EntityMetadata | undefined;
  const finalFieldName = fieldPath[fieldPath.length - 1];

  // Traverse the path to find the final entity
  for (let i = 0; i < fieldPath.length - 1; i++) {
    const fieldMeta = currentFieldsMap.get(fieldPath[i]);
    if (fieldMeta?.targetEntity) {
      targetEntity = schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);
      if (targetEntity) {
        currentFieldsMap = new Map(targetEntity.fields.map(f => [f.name, f]));
      }
    }
  }

  if (!targetEntity) {
    return finalFieldName;
  }

  return resolveToPrisma(finalFieldName, targetEntity, language);
}

// =============================================================================
// LABEL HELPERS (for building human-readable labels)
// =============================================================================

/**
 * Build a label string from a Prisma record using displayFields
 */
export function buildLabelFromRecord(
  record: Record<string, unknown>,
  entity: EntityMetadata,
  language: string
): string {
  const prismaFields = getDisplayFieldsForPrisma(entity, language);
  const parts: string[] = [];

  for (const field of prismaFields) {
    const value = record[field];
    if (value && typeof value === 'string') {
      parts.push(value);
    }
  }

  return parts.join(' ');
}
