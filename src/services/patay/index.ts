/**
 * PATAY - Pattern-Aware Tool Alignment for Yielding accurate responses
 *
 * Complete tool system for AI-powered data retrieval.
 * Includes: tools, validators, builders, corpus, and schema matching.
 */

// ============================================================================
// TOOLS - Main query and aggregation tools
// ============================================================================
export {
  // Types
  type Lang,
  type Operator,
  type StringOperator,
  type NumberOperator,
  type DateOperator,
  type ArrayOperator,
  type RelationOperator,
  type SortOrder,
  type AggregateOperation,
  type Filter,
  type OrFilter,
  type AndFilter,
  type FilterExpression,
  type OrderBy,
  type Include,
  type QueryArgs,
  type QueryResult,
  type AggregateArgs,
  type AggregateResult,
  type AggregateResultSimple,
  type AggregateResultGrouped,
  type LookupArgs,
  type LookupResult,
  type ToolContext,
  type SchemaInfo,
  type EntityInfo,
  type FieldInfo,
  type FieldType,
  type ToolError,
  type ToolResult,
  // Operators
  ALL_OPERATORS,
  getOperatorsForType,
  isOperatorValidForType,
  getDefaultOperator,
  // Query tool
  executeQuery,
  getQueryToolDefinition,
  // Aggregate tool
  executeAggregate,
  getAggregateToolDefinition,
  // Tool descriptions
  getAllToolDefinitions,
  getOpenAIToolDefinitions,
  getAnthropicToolDefinitions,
  generateToolSelectionGuidance,
} from './tools';

// ============================================================================
// VALIDATORS - Input validation
// ============================================================================
export {
  validateEntity,
  findEntityByName,
  findEntityByLabel,
  getAllEntityNames,
  validateFilters,
  validateFilterExpression,
  resolveFieldPath,
  validateOperator,
  coerceValue,
} from './validators';

// ============================================================================
// BUILDERS - Prisma query construction
// ============================================================================
export {
  buildWhere,
  buildSelect,
  buildInclude,
  mergeWhere,
  mergeSelect,
  mergeInclude,
  type PrismaWhere,
  type PrismaSelect,
  type PrismaInclude,
} from './builders';

// ============================================================================
// CORPUS - Test corpus system (CLI only - not exported to avoid bundle issues)
// Run directly: npx ts-node src/services/patay/corpus/corpusRunner.ts
// ============================================================================

// ============================================================================
// SCHEMA MATCHER - Pre-LLM deterministic resolution
// ============================================================================
export {
  matchSchema,
  shouldSkipClassifier,
  getSchemaHint,
  detectLanguage,
  type SchemaMatchResult,
  type MatchType,
  type MatchConfidence,
  type EntityMatch,
  type FieldMatch,
  type SupportedLang,
} from './schemaMatcher';

// ============================================================================
// CLASSIFIER - Ambiguity classification enhancements
// ============================================================================
export {
  buildRichSchemaContext,
  buildCompactSchemaContext,
  extractGlossaryTerms,
  extractLookupLabels,
  extractSearchableLabels,
  extractGroupableLabels,
  extractRelationPaths,
  type RichSchemaContext,
  type GlossaryTerm,
  type GlossaryResult,
} from './classifier';

// ============================================================================
// DOMAIN RULES - Deterministic disambiguation checks
// ============================================================================
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
} from './classifier';
