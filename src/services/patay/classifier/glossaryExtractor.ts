/**
 * PATAY Classifier - Glossary Extractor
 *
 * Extracts glossary terms from the schema for the ambiguity classifier.
 * Glossary terms help the classifier recognize domain-specific vocabulary.
 *
 * Sources:
 * - Lookup/catalog entity labels
 * - Enum values and their labels
 * - Entity labels (singular and plural)
 * - Key field labels
 */

import { VisibleSchema, VisibleEntity } from '../../aiSearch/security/types';

// ============================================================================
// TYPES
// ============================================================================

export interface GlossaryTerm {
  term: string;
  type: 'entity' | 'field' | 'lookup' | 'enum';
  context?: string;
}

export interface GlossaryResult {
  /** Simple list of terms for backward compatibility */
  terms: string[];

  /** Structured terms with metadata */
  structured: GlossaryTerm[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if entity is a lookup/catalog (small, typically ≤3 fields)
 */
function isLookupEntity(entity: VisibleEntity): boolean {
  return entity.fields.length <= 3;
}

/**
 * Normalize term for deduplication
 */
function normalize(term: string): string {
  return term.toLowerCase().trim();
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Extract glossary terms from visible schema
 *
 * @param schema - Visible schema for the current user
 * @returns Glossary terms for classifier prompt
 */
export function extractGlossaryTerms(schema: VisibleSchema): GlossaryResult {
  const structured: GlossaryTerm[] = [];
  const seenNormalized = new Set<string>();

  /**
   * Add term if not already seen
   */
  function addTerm(term: string, type: GlossaryTerm['type'], context?: string): void {
    const normalized = normalize(term);
    if (!normalized || seenNormalized.has(normalized)) return;

    seenNormalized.add(normalized);
    structured.push({ term, type, context });
  }

  // =========================================================================
  // 1. Entity labels (singular and plural where available)
  // =========================================================================
  for (const entity of schema.entities) {
    if (entity.label) {
      addTerm(entity.label, 'entity', entity.name);
    }
  }

  // =========================================================================
  // 2. Lookup/catalog entity labels (marked specially)
  // =========================================================================
  for (const entity of schema.entities) {
    if (isLookupEntity(entity) && entity.label) {
      addTerm(entity.label, 'lookup', entity.name);
    }
  }

  // =========================================================================
  // 3. Key field labels (searchable and groupable)
  // =========================================================================
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if ((field.searchable || field.groupable) && field.label) {
        addTerm(field.label, 'field', `${entity.name}.${field.name}`);
      }
    }
  }

  // =========================================================================
  // 4. Reference field target labels
  // =========================================================================
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.type === 'reference' && field.targetEntity) {
        const targetEntity = schema.entities.find(e => e.name === field.targetEntity);
        if (targetEntity?.label) {
          addTerm(targetEntity.label, 'entity', field.targetEntity);
        }
      }
    }
  }

  return {
    terms: structured.map(t => t.term),
    structured,
  };
}

/**
 * Extract lookup entity labels specifically
 * These are important for value validation
 */
export function extractLookupLabels(schema: VisibleSchema): string[] {
  return schema.entities
    .filter(isLookupEntity)
    .map(e => e.label)
    .filter(Boolean);
}

/**
 * Extract searchable field labels
 * These indicate what users can filter by
 */
export function extractSearchableLabels(schema: VisibleSchema): string[] {
  const labels = new Set<string>();

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.searchable && field.label) {
        labels.add(field.label);
      }
    }
  }

  return Array.from(labels);
}

/**
 * Extract groupable field labels
 * These indicate what users can aggregate by
 */
export function extractGroupableLabels(schema: VisibleSchema): string[] {
  const labels = new Set<string>();

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.groupable && field.label) {
        labels.add(field.label);
      }
    }
  }

  return Array.from(labels);
}

/**
 * Get all relation paths for navigation validation
 * Helps classifier understand valid navigation paths
 */
export function extractRelationPaths(schema: VisibleSchema): string[] {
  const paths: string[] = [];

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.type === 'reference' && field.targetEntity) {
        const targetEntity = schema.entities.find(e => e.name === field.targetEntity);
        if (targetEntity) {
          const cardinality = field.multi ? '*' : '1';
          paths.push(`${entity.label} → ${targetEntity.label} (${cardinality})`);
        }
      }
    }
  }

  return paths;
}
