/**
 * PATAY Validators - Entity Validator
 *
 * Validates entity names against the schema.
 * Provides helpful suggestions when entity is not found.
 */

import {
  SchemaInfo,
  EntityInfo,
  EntityNotFoundError,
  ToolResult,
  Lang,
} from '../tools/types';

// ============================================================================
// TYPES
// ============================================================================

export interface EntityValidationResult {
  entity: EntityInfo;
}

// ============================================================================
// NORMALIZATION
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
 * Calculate simple edit distance (Levenshtein)
 */
function editDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================================================
// ENTITY LOOKUP
// ============================================================================

/**
 * Find entity by exact name
 */
export function findEntityByName(
  schema: SchemaInfo,
  entityName: string
): EntityInfo | undefined {
  const normalized = normalize(entityName);
  return schema.entities.find(e => normalize(e.name) === normalized);
}

/**
 * Find entity by label (multilingual)
 */
export function findEntityByLabel(
  schema: SchemaInfo,
  label: string,
  lang?: Lang
): EntityInfo | undefined {
  const normalized = normalize(label);

  for (const entity of schema.entities) {
    if (!entity.labels) continue;

    // Check all languages if lang not specified
    const langsToCheck: Lang[] = lang ? [lang] : ['es', 'en', 'pt'];

    for (const l of langsToCheck) {
      const labels = entity.labels[l];
      if (!labels) continue;

      const singular = labels.s ? normalize(labels.s) : '';
      const plural = labels.p ? normalize(labels.p) : '';

      if (singular === normalized || plural === normalized) {
        return entity;
      }
    }
  }

  return undefined;
}

/**
 * Find similar entity names (for suggestions)
 */
export function findSimilarEntities(
  schema: SchemaInfo,
  entityName: string,
  maxResults = 3
): string[] {
  const normalized = normalize(entityName);

  const scored = schema.entities.map(e => ({
    name: e.name,
    distance: editDistance(normalized, normalize(e.name)),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  return scored
    .slice(0, maxResults)
    .filter(s => s.distance <= Math.max(3, normalized.length / 2))
    .map(s => s.name);
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate entity exists in schema
 *
 * Checks in order:
 * 1. Exact name match (case-insensitive)
 * 2. Label match (multilingual)
 *
 * Returns the entity info or an error with suggestions.
 */
export function validateEntity(
  schema: SchemaInfo,
  entityName: string,
  lang?: Lang
): ToolResult<EntityValidationResult> {
  // Try exact name match
  let entity = findEntityByName(schema, entityName);

  // Try label match
  if (!entity) {
    entity = findEntityByLabel(schema, entityName, lang);
  }

  if (entity) {
    return {
      success: true,
      data: { entity },
    };
  }

  // Entity not found - provide helpful error
  const similarEntities = findSimilarEntities(schema, entityName);
  const availableEntities = schema.entities.map(e => e.name);

  const error: EntityNotFoundError = {
    code: 'ENTITY_NOT_FOUND',
    entity: entityName,
    availableEntities: similarEntities.length > 0 ? similarEntities : availableEntities.slice(0, 5),
  };

  return {
    success: false,
    error,
  };
}

/**
 * Get all entity names
 */
export function getAllEntityNames(schema: SchemaInfo): string[] {
  return schema.entities.map(e => e.name);
}

/**
 * Check if entity has a specific relation
 */
export function entityHasRelation(
  entity: EntityInfo,
  relationName: string
): boolean {
  const normalized = normalize(relationName);
  return entity.fields.some(
    f => f.isRelation && normalize(f.name) === normalized
  );
}

/**
 * Get entity's relation fields
 */
export function getEntityRelations(entity: EntityInfo): string[] {
  return entity.fields
    .filter(f => f.isRelation)
    .map(f => f.name);
}
