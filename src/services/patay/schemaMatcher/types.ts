/**
 * PATAY Schema Matcher - Types
 *
 * Type definitions for deterministic schema matching.
 */

export type SupportedLang = 'es' | 'en' | 'pt';

export type MatchConfidence = 'exact' | 'partial' | 'none';

export type MatchType = 'entity' | 'field' | 'collision' | 'no_match';

export interface EntityMatch {
  entityName: string;
  entityLabel: string;
  matchedForm: 'singular' | 'plural';
}

export interface FieldMatch {
  entityName: string;
  entityLabel: string;
  fieldName: string;
  fieldLabel: string;
}

export interface SchemaMatchResult {
  type: MatchType;
  confidence: MatchConfidence;

  /** Matched entity (when type = 'entity') */
  entity?: EntityMatch;

  /** Matched fields (when type = 'field' or 'collision') */
  fields?: FieldMatch[];

  /** Collision details (when type = 'collision') */
  collision?: {
    entityMatch: EntityMatch;
    fieldMatches: FieldMatch[];
  };

  /** Debug info */
  debug?: {
    normalizedQuery: string;
    tokens: string[];
    matchedToken?: string;
  };
}
