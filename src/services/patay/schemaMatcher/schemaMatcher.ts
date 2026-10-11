/**
 * PATAY Schema Matcher
 *
 * Deterministic pre-LLM resolution of schema references.
 * Runs BEFORE the ambiguity classifier to resolve clear entity/field matches.
 *
 * Key insight: Entity labels should take priority over field labels when matching.
 * This prevents false ambiguity detection for queries like "list all [entity_plural]".
 *
 * @see docs/paper/MODELS/PATAY_V2_SPEC.md for theoretical foundation
 */

import { SchemaMetadata } from '../../aiSearch/security/types';
import {
  SupportedLang,
  EntityMatch,
  FieldMatch,
  SchemaMatchResult,
} from './types';

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

/**
 * Normalize text for matching:
 * - Lowercase
 * - Remove accents
 * - Collapse whitespace
 */
function normalize(text: string | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize query into words for matching
 */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Check if tokens contain a multi-word phrase
 */
function containsPhrase(tokens: string[], phrase: string): boolean {
  if (!phrase) return false;
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0) return false;

  const phraseStr = phraseTokens.join(' ');
  const tokensStr = tokens.join(' ');

  return tokensStr.includes(phraseStr);
}

/**
 * Get label for language with fallback
 */
function getLabel(
  labels: Record<string, { s?: string; p?: string; d?: string }> | undefined,
  lang: SupportedLang,
  plural: boolean
): string {
  if (!labels) return '';
  const langLabels = labels[lang] || labels['es'] || labels['en'];
  if (!langLabels) return '';
  return (plural ? langLabels.p : langLabels.s) || langLabels.s || '';
}

// ============================================================================
// FIELD MATCHING
// ============================================================================

/**
 * Find all fields in the schema that match a given label
 */
function findFieldsWithLabel(
  schema: SchemaMetadata,
  label: string,
  lang: SupportedLang
): FieldMatch[] {
  const normalizedLabel = normalize(label);
  const matches: FieldMatch[] = [];

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      const fieldLabelSingular = normalize(getLabel(field.labels, lang, false));
      const fieldLabelPlural = normalize(getLabel(field.labels, lang, true));

      if (fieldLabelSingular === normalizedLabel || fieldLabelPlural === normalizedLabel) {
        matches.push({
          entityName: entity.name,
          entityLabel: getLabel(entity.labels, lang, false),
          fieldName: field.name,
          fieldLabel: getLabel(field.labels, lang, false),
        });
      }
    }
  }

  return matches;
}

/**
 * Find fields whose labels appear in the query tokens
 */
function findFieldsMatchingQuery(
  schema: SchemaMetadata,
  tokens: string[],
  lang: SupportedLang
): FieldMatch[] {
  const matches: FieldMatch[] = [];

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      const fieldLabelSingular = normalize(getLabel(field.labels, lang, false));
      const fieldLabelPlural = normalize(getLabel(field.labels, lang, true));

      if (
        (fieldLabelSingular && containsPhrase(tokens, fieldLabelSingular)) ||
        (fieldLabelPlural && containsPhrase(tokens, fieldLabelPlural))
      ) {
        matches.push({
          entityName: entity.name,
          entityLabel: getLabel(entity.labels, lang, false),
          fieldName: field.name,
          fieldLabel: getLabel(field.labels, lang, false),
        });
      }
    }
  }

  return matches;
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Detect language from query based on common keywords
 */
export function detectLanguage(query: string): SupportedLang {
  const normalized = normalize(query);

  // Portuguese indicators
  if (/\b(listar|mostrar|quais|quantos|onde|como)\b/.test(normalized) &&
      /\b(os|as|do|da|dos|das|tem|sao)\b/.test(normalized)) {
    return 'pt';
  }

  // English indicators
  if (/\b(list|show|what|how many|where|which)\b/.test(normalized) &&
      /\b(the|of|with|are|is|have)\b/.test(normalized)) {
    return 'en';
  }

  // Default to Spanish
  return 'es';
}

// ============================================================================
// MAIN MATCHING FUNCTION
// ============================================================================

/**
 * Main schema matching function
 *
 * Resolves query terms to schema elements with priority:
 * 1. Entity labels (singular and plural)
 * 2. Field labels
 * 3. Collision detection
 *
 * @param query - User's natural language query
 * @param schema - Full schema metadata with multilingual labels
 * @param lang - Language for label matching (auto-detected if not provided)
 * @returns Match result with resolved entity/field or collision info
 */
export function matchSchema(
  query: string,
  schema: SchemaMetadata,
  lang?: SupportedLang
): SchemaMatchResult {
  const detectedLang = lang || detectLanguage(query);
  const normalizedQuery = normalize(query);
  const tokens = tokenize(normalizedQuery);

  const debug = {
    normalizedQuery,
    tokens,
    matchedToken: undefined as string | undefined,
  };

  // =========================================================================
  // STEP 1: Check entity labels (highest priority)
  // =========================================================================
  for (const entity of schema.entities) {
    const singularLabel = normalize(getLabel(entity.labels, detectedLang, false));
    const pluralLabel = normalize(getLabel(entity.labels, detectedLang, true));

    let matchedForm: 'singular' | 'plural' | null = null;
    let matchedLabel = '';

    // Check plural first (more specific for "list all X" queries)
    if (pluralLabel && containsPhrase(tokens, pluralLabel)) {
      matchedForm = 'plural';
      matchedLabel = pluralLabel;
    } else if (singularLabel && containsPhrase(tokens, singularLabel)) {
      matchedForm = 'singular';
      matchedLabel = singularLabel;
    }

    if (matchedForm) {
      debug.matchedToken = matchedLabel;

      // Check for collision with field labels
      const fieldCollisions = findFieldsWithLabel(schema, singularLabel, detectedLang);

      if (fieldCollisions.length > 0) {
        return {
          type: 'collision',
          confidence: 'exact',
          collision: {
            entityMatch: {
              entityName: entity.name,
              entityLabel: getLabel(entity.labels, detectedLang, false),
              matchedForm,
            },
            fieldMatches: fieldCollisions,
          },
          debug,
        };
      }

      // Clear entity match - no collision
      return {
        type: 'entity',
        confidence: 'exact',
        entity: {
          entityName: entity.name,
          entityLabel: getLabel(entity.labels, detectedLang, false),
          matchedForm,
        },
        debug,
      };
    }
  }

  // =========================================================================
  // STEP 2: Check field labels
  // =========================================================================
  const fieldMatches = findFieldsMatchingQuery(schema, tokens, detectedLang);

  if (fieldMatches.length === 1) {
    return {
      type: 'field',
      confidence: 'exact',
      fields: fieldMatches,
      debug,
    };
  }

  if (fieldMatches.length > 1) {
    // Multiple fields match - this is a collision that needs disambiguation
    return {
      type: 'collision',
      confidence: 'partial',
      fields: fieldMatches,
      debug,
    };
  }

  // =========================================================================
  // STEP 3: No clear match
  // =========================================================================
  return {
    type: 'no_match',
    confidence: 'none',
    debug,
  };
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Check if schema matcher result indicates we should skip the LLM classifier
 *
 * Skip when:
 * - Clear entity match (no collision)
 * - Clear single field match (no collision)
 *
 * Don't skip when:
 * - Collision detected (needs disambiguation)
 * - No match (let classifier analyze semantics)
 */
export function shouldSkipClassifier(result: SchemaMatchResult): boolean {
  if (result.type === 'entity' && result.confidence === 'exact') {
    return true;
  }

  if (result.type === 'field' && result.confidence === 'exact' && result.fields?.length === 1) {
    return true;
  }

  return false;
}

/**
 * Get hint to inject into LLM context based on schema match
 *
 * This helps the main LLM make better tool selection decisions
 * by providing resolved schema context.
 *
 * IMPORTANT: The hint must be strong enough to override system prompt
 * guidance that might otherwise prevent the LLM from querying certain
 * entities (e.g., lookup entities listed as "use get_lookup_values only").
 */
export function getSchemaHint(result: SchemaMatchResult, lang: SupportedLang): string | null {
  if (result.type === 'entity' && result.entity) {
    const form = result.entity.matchedForm === 'plural' ? 'plural form' : 'singular form';
    // Strong override hint that instructs the LLM to use query_entities
    return `[SYSTEM: "${result.entity.entityLabel}" (${form}) = entity ${result.entity.entityName}. ` +
      `Use query_entities(entity: "${result.entity.entityName}") to list/query this entity. ` +
      `This entity IS directly queryable.]`;
  }

  if (result.type === 'field' && result.fields?.length === 1) {
    const f = result.fields[0];
    return `[SYSTEM: "${f.fieldLabel}" = field ${f.entityName}.${f.fieldName}]`;
  }

  return null;
}
