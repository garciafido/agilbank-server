/**
 * Tool Registry
 *
 * Manages registration and execution of search tools.
 */

import { Tool, ToolHandler, ToolExecutionResult } from './types';
import { SearchContext, SearchToolDefinition, SearchToolResult } from '../types';

/**
 * Tool Registry class
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions (for LLM)
   */
  getDefinitions(): SearchToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Get all tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: SearchContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        toolName: name,
        result: {
          success: false,
          error: `Tool not found: ${name}`,
        },
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const result = await tool.handler(args, context);

      return {
        toolName: name,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        toolName: name,
        result: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeMany(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
    context: SearchContext
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(
      calls.map((call) => this.execute(call.name, call.args, context))
    );
  }
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
