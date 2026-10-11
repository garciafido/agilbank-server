/**
 * Tools Module
 *
 * Exports tool types, registry, and built-in tools.
 */

// Types
export * from './types';

// Registry
export { ToolRegistry, createToolRegistry } from './toolRegistry';

// Built-in tools
export { createDocumentSearchTool } from './documentSearchTool';
export { createEntityQueryTool } from './entityQueryTool';
export { createAggregationTool } from './aggregationTool';
export { createNextPageTool } from './nextPageTool';
export { createLookupTool, LookupValue, LookupExecutor } from './lookupTool';

// Context helpers
export {
  createServiceContextFromSearch,
  clearUserCache,
  invalidateUserCache,
} from './serviceContextHelper';

// Raw SQL helpers for advanced queries
export { executeSecureGroupByNestedPath } from './secureRawSql';
