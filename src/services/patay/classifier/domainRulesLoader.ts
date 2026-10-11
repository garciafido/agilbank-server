/**
 * PATAY Domain Rules Loader
 *
 * Loads and provides access to the generated disambiguation rules.
 * These rules enable deterministic pre-LLM checks for common ambiguity patterns.
 *
 * @see disambiguation-rules.json (generated from Haiku schema)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES (mirror of generator types)
// ============================================================================

type Lang = 'es' | 'en' | 'pt';

export interface LabelCollision {
  label: string;
  lang: Lang;
  matches: Array<{
    type: 'entity' | 'field';
    entityName: string;
    fieldName?: string;
    meaning?: string;
  }>;
}

export interface TemporalField {
  entityName: string;
  fieldName: string;
  label: string;
  type: 'Date' | 'DateTime';
  semanticHint?: string;
}

export interface LookupEntity {
  entityName: string;
  label: string;
  values: string[];
  source: 'config' | 'enum' | 'cacheable';
}

export interface ValidRelation {
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  fieldName: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
}

export interface GroupableField {
  entityName: string;
  entityLabel: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
}

export interface DisambiguationRules {
  generatedAt: string;
  domain: string;
  version: string;
  labelCollisions: LabelCollision[];
  temporalFields: TemporalField[];
  lookupEntities: LookupEntity[];
  validRelations: ValidRelation[];
  groupableFields: GroupableField[];
  stats: {
    totalEntities: number;
    totalCollisions: number;
    totalTemporalFields: number;
    totalLookups: number;
    totalRelations: number;
    totalGroupableFields: number;
  };
}

// ============================================================================
// LOADER
// ============================================================================

let cachedRules: DisambiguationRules | null = null;

/**
 * Load disambiguation rules from generated JSON file
 */
export function loadDisambiguationRules(basePath?: string): DisambiguationRules | null {
  if (cachedRules) return cachedRules;

  try {
    const rulesPath = basePath
      ? path.join(basePath, 'disambiguation-rules.json')
      : path.join(__dirname, 'disambiguation-rules.json');

    if (!fs.existsSync(rulesPath)) {
      console.warn('[DomainRulesLoader] disambiguation-rules.json not found');
      return null;
    }

    const content = fs.readFileSync(rulesPath, 'utf-8');
    cachedRules = JSON.parse(content) as DisambiguationRules;
    console.log(`[DomainRulesLoader] Loaded ${cachedRules.stats.totalEntities} entities, ${cachedRules.stats.totalCollisions} collisions`);
    return cachedRules;
  } catch (error) {
    console.error('[DomainRulesLoader] Failed to load rules:', error);
    return null;
  }
}

/**
 * Clear cached rules (for testing or hot reload)
 */
export function clearRulesCache(): void {
  cachedRules = null;
}

// ============================================================================
// DETERMINISTIC CHECKS
// ============================================================================

/**
 * Normalize text for comparison (lowercase, remove accents)
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface CollisionCheckResult {
  found: boolean;
  label: string;
  matches: LabelCollision['matches'];
}

/**
 * Check if a term in the query collides with multiple fields/entities
 */
export function checkLabelCollisions(
  query: string,
  rules: DisambiguationRules,
  lang?: Lang
): CollisionCheckResult | null {
  const normalizedQuery = normalize(query);

  for (const collision of rules.labelCollisions) {
    if (lang && collision.lang !== lang) continue;

    const normalizedLabel = normalize(collision.label);
    // Check if the label appears as a word in the query
    const wordBoundary = new RegExp(`\\b${escapeRegex(normalizedLabel)}\\b`);
    if (wordBoundary.test(normalizedQuery)) {
      return {
        found: true,
        label: collision.label,
        matches: collision.matches,
      };
    }
  }

  return null;
}

export interface TemporalCheckResult {
  found: boolean;
  term: string;
  possibleFields: TemporalField[];
}

/**
 * Check if query mentions temporal concepts without specifying which field
 */
export function checkTemporalAmbiguity(
  query: string,
  rules: DisambiguationRules,
  entityName?: string
): TemporalCheckResult | null {
  const normalizedQuery = normalize(query);

  // Temporal keywords that need clarification
  const temporalKeywords = [
    { pattern: /\b(reciente|nuevo|ultima?|ultimo?)\b/, term: 'reciente' },
    { pattern: /\b(recent|new|latest)\b/, term: 'recent' },
    { pattern: /\b(antiguo|viejo|primera?|primero?)\b/, term: 'antiguo' },
    { pattern: /\b(old|first|earliest)\b/, term: 'old' },
    { pattern: /\b(fecha|date|data)\b/, term: 'fecha' },
    { pattern: /\b(cuando|when|quando)\b/, term: 'cuando' },
  ];

  for (const { pattern, term } of temporalKeywords) {
    if (pattern.test(normalizedQuery)) {
      // Find temporal fields for the entity (or all if not specified)
      const relevantFields = rules.temporalFields.filter(
        f => !entityName || f.entityName === entityName
      );

      // Only ambiguous if multiple temporal fields exist
      if (relevantFields.length > 1) {
        return {
          found: true,
          term,
          possibleFields: relevantFields,
        };
      }
    }
  }

  return null;
}

export interface LookupCheckResult {
  exists: boolean;
  value: string;
  entityName: string;
  suggestions: string[];
}

/**
 * Check if a value exists in a lookup entity
 */
export function checkLookupValue(
  value: string,
  entityName: string,
  rules: DisambiguationRules
): LookupCheckResult | null {
  const lookup = rules.lookupEntities.find(l => l.entityName === entityName);
  if (!lookup || lookup.values.length === 0) {
    return null; // No values to check against (cacheable entities)
  }

  const normalizedValue = normalize(value);
  const normalizedValues = lookup.values.map(normalize);

  // Exact match
  if (normalizedValues.includes(normalizedValue)) {
    return { exists: true, value, entityName, suggestions: [] };
  }

  // Find similar values (Levenshtein distance <= 2 or contains)
  const suggestions = lookup.values.filter(v => {
    const nv = normalize(v);
    return nv.includes(normalizedValue) || normalizedValue.includes(nv);
  });

  return {
    exists: false,
    value,
    entityName,
    suggestions: suggestions.slice(0, 5),
  };
}

export interface RelationCheckResult {
  valid: boolean;
  from: string;
  to: string;
  path?: ValidRelation;
}

/**
 * Check if a relation path exists between two entities
 */
export function checkRelationExists(
  fromEntity: string,
  toEntity: string,
  rules: DisambiguationRules
): RelationCheckResult {
  // Direct relation
  const direct = rules.validRelations.find(
    r => r.from === fromEntity && r.to === toEntity
  );
  if (direct) {
    return { valid: true, from: fromEntity, to: toEntity, path: direct };
  }

  // Reverse relation
  const reverse = rules.validRelations.find(
    r => r.from === toEntity && r.to === fromEntity
  );
  if (reverse) {
    return { valid: true, from: fromEntity, to: toEntity, path: reverse };
  }

  return { valid: false, from: fromEntity, to: toEntity };
}

/**
 * Get all groupable fields for an entity
 */
export function getGroupableFields(
  entityName: string,
  rules: DisambiguationRules
): GroupableField[] {
  return rules.groupableFields.filter(f => f.entityName === entityName);
}

/**
 * Check if a field is groupable
 */
export function isFieldGroupable(
  entityName: string,
  fieldName: string,
  rules: DisambiguationRules
): boolean {
  return rules.groupableFields.some(
    f => f.entityName === entityName && f.fieldName === fieldName
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
