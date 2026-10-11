/**
 * PATAY Classifier - Rich Schema Context Builder
 *
 * Builds a comprehensive schema context for the ambiguity classifier.
 * Extracts ALL available schema information instead of just a subset.
 *
 * Problem this solves:
 * The original classifier only used ~15 field labels (3 entities × 5 fields).
 * This version uses ALL entities with their key fields and relations.
 */

import { VisibleSchema, VisibleEntity, VisibleField } from '../../aiSearch/security/types';

// ============================================================================
// TYPES
// ============================================================================

export interface RichSchemaContext {
  /** Full text for LLM prompt */
  text: string;

  /** Structured data for deterministic checks */
  data: {
    entityCount: number;
    relationCount: number;
    lookupCount: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get key fields for an entity (searchable, groupable, or reference)
 */
function getKeyFields(entity: VisibleEntity): VisibleField[] {
  return entity.fields.filter(f =>
    f.searchable || f.groupable || f.type === 'reference'
  );
}

/**
 * Get relation fields for an entity
 */
function getRelationFields(entity: VisibleEntity): VisibleField[] {
  return entity.fields.filter(f => f.type === 'reference');
}

/**
 * Get lookup fields for an entity
 */
function getLookupFields(entity: VisibleEntity): VisibleField[] {
  return entity.fields.filter(f => f.isLookup);
}

/**
 * Format field for display
 */
function formatField(field: VisibleField): string {
  let formatted = field.label;

  // Add type indicator for references
  if (field.type === 'reference') {
    formatted += field.multi ? '*→' : '→';
    formatted += field.targetEntity || '?';
  }

  return formatted;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build rich schema context for the classifier prompt
 *
 * Provides:
 * 1. ALL entities with their labels
 * 2. Key fields (searchable, groupable) per entity
 * 3. Relations with cardinality indicators
 * 4. Lookup entities clearly marked
 * 5. Inverse relations for navigation
 *
 * @param schema - Visible schema for the current user
 * @returns Rich context object with text for prompt and metadata
 */
export function buildRichSchemaContext(schema: VisibleSchema): RichSchemaContext {
  const sections: string[] = [];
  let relationCount = 0;
  let lookupCount = 0;

  // =========================================================================
  // Section 1: All entities with key fields
  // =========================================================================
  sections.push('ENTITIES:');

  for (const entity of schema.entities) {
    const keyFields = getKeyFields(entity);
    const lookupFields = getLookupFields(entity);

    // Format key fields (limit to 5 for readability)
    const fieldLabels = keyFields
      .slice(0, 5)
      .map(formatField)
      .join(', ');

    // Entity line with name and fields
    let line = `- ${entity.label} (${entity.name})`;
    if (fieldLabels) {
      line += `: ${fieldLabels}`;
    }

    // Mark if entity is a lookup (small, cacheable)
    if (entity.fields.length <= 3) {
      line += ' [catalog]';
      lookupCount++;
    }

    sections.push(line);
  }

  // =========================================================================
  // Section 2: Explicit relations
  // =========================================================================
  sections.push('');
  sections.push('RELATIONS:');

  for (const entity of schema.entities) {
    const relations = getRelationFields(entity);

    for (const rel of relations) {
      const cardinality = rel.multi ? '→*' : '→1';
      const targetEntity = schema.entities.find(e => e.name === rel.targetEntity);
      const targetLabel = targetEntity?.label || rel.targetEntity || '?';

      sections.push(`- ${entity.label} ${cardinality} ${targetLabel} (${entity.name}.${rel.name})`);
      relationCount++;
    }
  }

  // =========================================================================
  // Section 3: Inverse relations (for navigation queries)
  // =========================================================================
  const entitiesWithInverse = schema.entities.filter(e =>
    e.inverseRelations && e.inverseRelations.length > 0
  );

  if (entitiesWithInverse.length > 0) {
    sections.push('');
    sections.push('INVERSE NAVIGATION:');

    for (const entity of entitiesWithInverse) {
      for (const inv of entity.inverseRelations || []) {
        const sourceEntity = schema.entities.find(e => e.name === inv.sourceEntity);
        const sourceLabel = sourceEntity?.label || inv.sourceEntity;

        sections.push(`- ${entity.label} ←* ${sourceLabel} (via ${inv.sourceField})`);
      }
    }
  }

  // =========================================================================
  // Section 4: Lookup/catalog entities
  // =========================================================================
  const lookupEntities = schema.entities.filter(e => e.fields.length <= 3);

  if (lookupEntities.length > 0) {
    sections.push('');
    sections.push('CATALOGS (use get_lookup_values for these):');

    for (const entity of lookupEntities) {
      sections.push(`- ${entity.label}`);
    }
  }

  return {
    text: sections.join('\n'),
    data: {
      entityCount: schema.entities.length,
      relationCount,
      lookupCount,
    },
  };
}

/**
 * Build compact schema context for constrained prompts
 * Uses less tokens while still providing key information
 */
export function buildCompactSchemaContext(schema: VisibleSchema): string {
  const lines: string[] = [];

  // Just entity labels in one line
  const entityLabels = schema.entities.map(e => e.label).join(', ');
  lines.push(`Entities: ${entityLabels}`);

  // Key searchable fields across all entities
  const searchableFields = new Set<string>();
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.searchable && field.label) {
        searchableFields.add(field.label);
      }
    }
  }
  lines.push(`Searchable: ${Array.from(searchableFields).slice(0, 15).join(', ')}`);

  // Groupable fields
  const groupableFields = new Set<string>();
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.groupable && field.label) {
        groupableFields.add(`${entity.label}.${field.label}`);
      }
    }
  }
  if (groupableFields.size > 0) {
    lines.push(`Groupable: ${Array.from(groupableFields).slice(0, 10).join(', ')}`);
  }

  return lines.join('\n');
}
