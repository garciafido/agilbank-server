/**
 * Tool Types for AI Search
 *
 * Types for defining and executing search tools.
 */

import { SearchContext, SearchToolResult } from '../types';

/**
 * Tool definition with handler
 */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  handler: ToolHandler;
}

/**
 * Tool handler function
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: SearchContext
) => Promise<SearchToolResult>;

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult {
  toolName: string;
  result: SearchToolResult;
  durationMs: number;
}
