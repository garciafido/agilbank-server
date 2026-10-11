/**
 * Query Explanation Module
 *
 * Exports for the query explanation system that provides human-readable
 * explanations of AI Search tool calls.
 */

export { QueryExplanationCollector } from './queryExplanationCollector';

export {
  OPERATOR_LABELS,
  RELATION_MODE_LABELS,
  TOOL_LABELS,
  ACTION_TEMPLATES,
  SUMMARY_TEMPLATES,
  getOperatorLabel,
  getRelationModeLabel,
  getToolLabel,
  getActionTemplates,
  getSummaryTemplates,
  interpolate,
} from './templates';
