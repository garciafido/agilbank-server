/**
 * PATAY Classifier - Ambiguity Classification Enhancements
 *
 * Provides enhanced context and glossary extraction for the ambiguity classifier.
 * These functions are called FROM aiSearch to improve classification accuracy.
 */

// Rich schema context for classifier prompt
export {
  buildRichSchemaContext,
  buildCompactSchemaContext,
  type RichSchemaContext,
} from './richSchemaContext';

// Glossary extraction for known terms
export {
  extractGlossaryTerms,
  extractLookupLabels,
  extractSearchableLabels,
  extractGroupableLabels,
  extractRelationPaths,
  type GlossaryTerm,
  type GlossaryResult,
} from './glossaryExtractor';

// Domain rules loader for deterministic disambiguation checks
export {
  loadDisambiguationRules,
  clearRulesCache,
  checkLabelCollisions,
  checkTemporalAmbiguity,
  checkLookupValue,
  checkRelationExists,
  getGroupableFields,
  isFieldGroupable,
  type DisambiguationRules,
  type LabelCollision,
  type TemporalField,
  type LookupEntity,
  type ValidRelation,
  type GroupableField,
  type CollisionCheckResult,
  type TemporalCheckResult,
  type LookupCheckResult,
  type RelationCheckResult,
} from './domainRulesLoader';
