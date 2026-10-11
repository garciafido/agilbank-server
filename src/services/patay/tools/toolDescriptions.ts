/**
 * PATAY Tools - LLM-Friendly Descriptions
 *
 * Descriptions optimized for LLM understanding with examples and usage guidelines.
 * These descriptions help the LLM select the correct tool and provide correct arguments.
 */

import { getQueryToolDefinition } from './queryTool';
import { getAggregateToolDefinition } from './aggregateTool';
import { SchemaInfo, EntityInfo, Lang } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolDescription {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  examples: ToolExample[];
}

export interface ToolExample {
  query: string;
  tool: string;
  args: Record<string, unknown>;
  explanation?: string;
}

// ============================================================================
// BASE DESCRIPTIONS
// ============================================================================

/**
 * Get base query tool description
 */
export function getQueryDescription(): ToolDescription {
  const def = getQueryToolDefinition();
  return {
    ...def,
    examples: [
      {
        query: 'list all authors',
        tool: 'query',
        args: { entity: 'Author' },
        explanation: 'Simple entity listing',
      },
      {
        query: 'authors from Spain',
        tool: 'query',
        args: {
          entity: 'Author',
          filters: [{ field: 'country.name', operator: 'equals', value: 'Spain' }],
        },
        explanation: 'Filter by related entity field',
      },
      {
        query: 'the genre of work "Bohemian Rhapsody"',
        tool: 'query',
        args: {
          entity: 'MusicalWork',
          filters: [{ field: 'title', operator: 'contains', value: 'Bohemian Rhapsody' }],
          include: [{ relation: 'genre' }],
          limit: 1,
        },
        explanation: 'Get single record with relation',
      },
      {
        query: 'works without authors',
        tool: 'query',
        args: {
          entity: 'MusicalWork',
          filters: [{ field: 'authors', operator: 'none', value: {} }],
        },
        explanation: 'Filter by relation absence',
      },
    ],
  };
}

/**
 * Get base aggregate tool description
 */
export function getAggregateDescription(): ToolDescription {
  const def = getAggregateToolDefinition();
  return {
    ...def,
    examples: [
      {
        query: 'how many authors are there',
        tool: 'aggregate',
        args: { entity: 'Author', operation: 'count' },
        explanation: 'Simple count',
      },
      {
        query: 'works by genre',
        tool: 'aggregate',
        args: { entity: 'MusicalWork', operation: 'count', groupBy: 'genre' },
        explanation: 'Count with groupBy',
      },
      {
        query: 'average duration of works',
        tool: 'aggregate',
        args: { entity: 'MusicalWork', operation: 'avg', field: 'duration' },
        explanation: 'Average of numeric field',
      },
      {
        query: 'authors with more than 5 works',
        tool: 'aggregate',
        args: {
          entity: 'WorkAuthor',
          operation: 'count',
          groupBy: 'authorId',
          having: { operation: 'count', operator: 'gt', value: 5 },
        },
        explanation: 'Count with having filter',
      },
    ],
  };
}

// ============================================================================
// SCHEMA-AWARE DESCRIPTIONS
// ============================================================================

/**
 * Get entity label in language
 */
function getEntityLabel(entity: EntityInfo, lang: Lang, plural: boolean): string {
  const labels = entity.labels?.[lang];
  if (!labels) return entity.name;
  return (plural ? labels.p : labels.s) || entity.name;
}

/**
 * Build entity-specific examples for query tool
 */
export function buildQueryExamples(schema: SchemaInfo, lang: Lang): ToolExample[] {
  const examples: ToolExample[] = [];

  for (const entity of schema.entities.slice(0, 5)) {
    const entityPlural = getEntityLabel(entity, lang, true);

    // Basic listing example
    examples.push({
      query: `list all ${entityPlural.toLowerCase()}`,
      tool: 'query',
      args: { entity: entity.name },
    });

    // Find relation for navigation example
    const relation = entity.fields.find(f => f.isRelation && !f.isArray);
    if (relation && relation.relationEntity) {
      const relatedEntity = schema.entities.find(e => e.name === relation.relationEntity);
      if (relatedEntity) {
        const relLabel = getEntityLabel(relatedEntity, lang, false);
        examples.push({
          query: `the ${relLabel.toLowerCase()} of ${entity.name} X`,
          tool: 'query',
          args: {
            entity: entity.name,
            include: [{ relation: relation.name }],
            limit: 1,
          },
        });
      }
    }
  }

  return examples;
}

/**
 * Build entity-specific examples for aggregate tool
 */
export function buildAggregateExamples(schema: SchemaInfo, lang: Lang): ToolExample[] {
  const examples: ToolExample[] = [];

  for (const entity of schema.entities.slice(0, 3)) {
    const entityPlural = getEntityLabel(entity, lang, true);

    // Count example
    examples.push({
      query: `how many ${entityPlural.toLowerCase()} are there`,
      tool: 'aggregate',
      args: { entity: entity.name, operation: 'count' },
    });

    // Find groupable field
    const groupableField = entity.fields.find(f => f.isGroupable || f.type === 'Enum');
    if (groupableField) {
      const fieldLabel = groupableField.labels?.[lang]?.s || groupableField.name;
      examples.push({
        query: `${entityPlural.toLowerCase()} by ${fieldLabel.toLowerCase()}`,
        tool: 'aggregate',
        args: {
          entity: entity.name,
          operation: 'count',
          groupBy: groupableField.name,
        },
      });
    }
  }

  return examples;
}

// ============================================================================
// TOOL SELECTION GUIDANCE
// ============================================================================

/**
 * Generate tool selection guidance for system prompt
 */
export function generateToolSelectionGuidance(schema: SchemaInfo, lang: Lang): string {
  const lines: string[] = [];

  lines.push('## Tool Selection Guide');
  lines.push('');
  lines.push('### Use `query` when:');
  lines.push('- Listing entities: "show all X", "list Y"');
  lines.push('- Finding specific records: "X where Y = Z"');
  lines.push('- Getting details: "the Y of X" (with limit: 1)');
  lines.push('- Navigating relations: "authors of work X"');
  lines.push('');
  lines.push('### Use `aggregate` when:');
  lines.push('- Counting: "how many X", "number of Y"');
  lines.push('- Statistics: "average X", "max Y"');
  lines.push('- Distribution: "X by Y", "X grouped by Y"');
  lines.push('');

  // Add entity-specific guidance
  lines.push('### Available Entities:');
  for (const entity of schema.entities) {
    const singular = getEntityLabel(entity, lang, false);
    const plural = getEntityLabel(entity, lang, true);
    const relations = entity.fields
      .filter(f => f.isRelation)
      .map(f => f.name)
      .slice(0, 3);

    lines.push(`- **${entity.name}** (${singular} / ${plural})`);
    if (relations.length > 0) {
      lines.push(`  Relations: ${relations.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('### Filter Operators:');
  lines.push('- Strings: equals, contains, startsWith, endsWith, not');
  lines.push('- Numbers/Dates: equals, not, gt, gte, lt, lte');
  lines.push('- Relations: some, every, none, is, isNot');
  lines.push('');

  lines.push('### Important:');
  lines.push('- String matching is case-insensitive by default');
  lines.push('- Use field paths for nested filters: "author.country.name"');
  lines.push('- Always specify entity name in PascalCase');

  return lines.join('\n');
}

// ============================================================================
// COMPLETE TOOL DEFINITIONS
// ============================================================================

/**
 * Get all tool definitions for LLM
 */
export function getAllToolDefinitions(): ToolDescription[] {
  return [getQueryDescription(), getAggregateDescription()];
}

/**
 * Get OpenAI-compatible tool definitions
 */
export function getOpenAIToolDefinitions(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return getAllToolDefinitions().map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Get Anthropic-compatible tool definitions
 */
export function getAnthropicToolDefinitions(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return getAllToolDefinitions().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}
