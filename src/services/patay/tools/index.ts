/**
 * PATAY Tools
 *
 * Query and aggregation tools for AI-powered data retrieval.
 * Designed for clarity, type safety, and LLM-friendly interfaces.
 */

// Types
export * from './types';

// Operators
export {
  ALL_OPERATORS,
  STRING_OPERATORS,
  NUMBER_OPERATORS,
  DATE_OPERATORS,
  ARRAY_OPERATORS,
  RELATION_OPERATORS,
  getOperatorsForType,
  isOperatorValidForType,
  getOperatorMeta,
  getStringOperators,
  getComparisonOperators,
  getRelationOperators,
  getDefaultOperator,
  type OperatorMeta,
} from './operators';

// Query tool
export {
  executeQuery,
  getQueryToolDefinition,
} from './queryTool';

// Aggregate tool
export {
  executeAggregate,
  getAggregateToolDefinition,
} from './aggregateTool';

// Tool descriptions
export {
  getQueryDescription,
  getAggregateDescription,
  buildQueryExamples,
  buildAggregateExamples,
  generateToolSelectionGuidance,
  getAllToolDefinitions,
  getOpenAIToolDefinitions,
  getAnthropicToolDefinitions,
  type ToolDescription,
  type ToolExample,
} from './toolDescriptions';
