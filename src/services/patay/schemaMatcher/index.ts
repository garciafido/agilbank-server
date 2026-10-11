/**
 * PATAY Schema Matcher
 *
 * Deterministic pre-LLM resolution of schema references.
 */

export * from './types';
export {
  matchSchema,
  shouldSkipClassifier,
  getSchemaHint,
  detectLanguage,
} from './schemaMatcher';
