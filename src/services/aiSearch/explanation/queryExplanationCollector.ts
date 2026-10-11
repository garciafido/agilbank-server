/**
 * Query Explanation Collector
 *
 * Collects information about tool calls during AI Search queries
 * and generates human-readable explanations.
 */

import type {
  QueryExplanation,
  ToolStepExplanation,
  FilterExplanation,
  AggregationExplanation,
} from '../types';

import {
  getOperatorLabel,
  getRelationModeLabel,
  getToolLabel,
  getActionTemplates,
  getSummaryTemplates,
  interpolate,
} from './templates';

// ============================================
// Types for Tool Call Recording
// ============================================

interface ToolCallInput {
  entity?: string;
  filters?: Array<{
    field: string;
    operator: string;
    value: unknown;
    relationMode?: string;
  }>;
  include?: Array<{
    field: string;
    select?: string[];
  }>;
  groupBy?: string;
  countRelation?: string;
  groupByCount?: string;
  having?: {
    countField: string;
    operator: string;
    value: number;
  };
  query?: string;
  language?: string;
}

interface ToolCallOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface RecordedToolCall {
  toolName: string;
  input: ToolCallInput;
  output: ToolCallOutput;
  durationMs: number;
}

// ============================================
// Schema Metadata Interface (for label resolution)
// ============================================

interface EntityMetadata {
  name: string;
  labels?: Record<string, { s: string; p: string }>;
  fields?: Array<{
    name: string;
    labels?: Record<string, { s: string }>;
    targetEntity?: string;
  }>;
}

interface SchemaMetadata {
  entities: EntityMetadata[];
}

// ============================================
// Query Explanation Collector
// ============================================

export class QueryExplanationCollector {
  private calls: RecordedToolCall[] = [];
  private schemaMetadata: SchemaMetadata | null = null;
  private lookupCache: Map<string, Map<string, string>> = new Map();
  private detectedLanguage: string | null = null;
  private tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Time metrics (in milliseconds)
  private startTime: number = Date.now();
  private firstTokenTime: number | null = null;
  private llmTimeMs: number = 0;
  private ragTimeMs: number = 0;

  // Usage counters
  private llmCallCount: number = 0;
  private ragChunksCount: number = 0;

  constructor(schemaMetadata?: SchemaMetadata) {
    this.schemaMetadata = schemaMetadata || null;
    this.startTime = Date.now();
  }

  /**
   * Get the language detected from tool calls
   */
  getDetectedLanguage(): string | null {
    return this.detectedLanguage;
  }

  /**
   * Record a tool call execution
   * Only records successful calls - failed calls (validation errors, retries)
   * are not shown to users in the explanation.
   */
  recordToolCall(
    toolName: string,
    input: ToolCallInput,
    output: ToolCallOutput,
    durationMs: number
  ): void {
    // Only record successful calls in the explanation
    // Failed calls (e.g., validation errors when LLM invents parameters) are not shown to users
    if (!output.success) {
      return;
    }

    this.calls.push({ toolName, input, output, durationMs });

    // Capture language from first tool call that has it
    if (!this.detectedLanguage && input.language) {
      this.detectedLanguage = input.language;
    }

    // Cache lookup values for later use in filter explanations
    if (toolName === 'get_lookup_values' && output.data) {
      const entity = input.entity || '';
      const lookupMap = new Map<string, string>();
      // The lookup tool returns { entity, values, count, hint }
      const lookupData = output.data as { values?: Array<{ id: string; label: string }> };
      if (Array.isArray(lookupData.values)) {
        for (const item of lookupData.values) {
          lookupMap.set(item.id, item.label);
        }
      }
      this.lookupCache.set(entity, lookupMap);
    }
  }

  /**
   * Record token usage from an LLM call
   */
  recordTokenUsage(usage: { promptTokens: number; completionTokens: number; totalTokens: number }): void {
    this.tokenUsage.promptTokens += usage.promptTokens;
    this.tokenUsage.completionTokens += usage.completionTokens;
    this.tokenUsage.totalTokens += usage.totalTokens;
  }

  /**
   * Generate complete explanation from recorded calls
   */
  generateExplanation(language: string): QueryExplanation {
    const steps = this.calls.map((call) => this.formatStep(call, language));
    const totalDurationMs = this.calls.reduce((sum, c) => sum + c.durationMs, 0);

    const result: QueryExplanation = {
      summary: this.generateSummary(language),
      steps,
      totalTools: this.calls.length,
      totalDurationMs,
    };

    // Include token usage if any tokens were recorded
    if (this.tokenUsage.totalTokens > 0) {
      result.tokenUsage = { ...this.tokenUsage };
    }

    return result;
  }

  /**
   * Check if any tool calls were recorded
   */
  hasToolCalls(): boolean {
    return this.calls.length > 0;
  }

  /**
   * Get current token usage (independent of tool calls)
   */
  getTokenUsage(): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
    if (this.tokenUsage.totalTokens === 0) return null;
    return { ...this.tokenUsage };
  }

  /**
   * Record LLM call time
   */
  recordLlmTime(durationMs: number): void {
    this.llmTimeMs += durationMs;
    this.llmCallCount++;
  }

  /**
   * Record RAG search time and chunks count
   */
  recordRagMetrics(durationMs: number, chunksCount: number): void {
    this.ragTimeMs += durationMs;
    this.ragChunksCount += chunksCount;
  }

  /**
   * Record time to first token
   */
  recordFirstToken(): void {
    if (this.firstTokenTime === null) {
      this.firstTokenTime = Date.now();
    }
  }

  /**
   * Get all metrics for persistence
   */
  getAllMetrics(): {
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    totalTimeMs: number;
    llmTimeMs: number;
    toolsTimeMs: number;
    ragTimeMs: number | null;
    firstTokenMs: number | null;
    llmCallCount: number;
    toolCallCount: number;
    ragChunksCount: number | null;
  } {
    const now = Date.now();
    const totalTimeMs = now - this.startTime;
    const toolsTimeMs = this.calls.reduce((sum, c) => sum + c.durationMs, 0);

    return {
      tokenUsage: this.getTokenUsage(),
      totalTimeMs,
      llmTimeMs: this.llmTimeMs,
      toolsTimeMs,
      ragTimeMs: this.ragTimeMs > 0 ? this.ragTimeMs : null,
      firstTokenMs: this.firstTokenTime !== null ? this.firstTokenTime - this.startTime : null,
      llmCallCount: this.llmCallCount,
      toolCallCount: this.calls.length,
      ragChunksCount: this.ragChunksCount > 0 ? this.ragChunksCount : null,
    };
  }

  /**
   * Clear recorded calls
   */
  clear(): void {
    this.calls = [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private formatStep(call: RecordedToolCall, language: string): ToolStepExplanation {
    const { toolName, input, output, durationMs } = call;
    const templates = getActionTemplates(language);

    const entityLabel = this.getEntityLabel(input.entity || '', language);
    const toolLabel = getToolLabel(toolName, language);

    // Build action description
    let action = '';
    let result = '';
    let filters: FilterExplanation[] | undefined;
    let aggregation: AggregationExplanation | undefined;
    let resultCount: number | undefined;
    let hasMore = false;

    switch (toolName) {
      case 'query_entities': {
        action = interpolate(templates.query_entities.base, { entityLabel });

        // Extract navigation chain from nested filter paths (e.g., "works.authors.author.gender")
        // This shows the relationship traversal: Editions → Works → Authors → Gender
        const navigationParts: string[] = [];
        if (input.filters && input.filters.length > 0) {
          for (const f of input.filters) {
            if (f.field.includes('.')) {
              const segments = f.field.split('.');
              // Get labels for intermediate segments (not the last one which is the filter field)
              for (let i = 0; i < segments.length - 1; i++) {
                const segmentLabel = this.getNavigationSegmentLabel(
                  input.entity || '',
                  segments.slice(0, i + 1),
                  language
                );
                if (segmentLabel && !navigationParts.includes(segmentLabel)) {
                  navigationParts.push(segmentLabel);
                }
              }
            }
          }
        }

        // Add navigation description from filter paths
        if (navigationParts.length > 0) {
          const includeChain = navigationParts.join(' → ');
          action += ' ' + interpolate(templates.query_entities.withIncludes, { includeChain });
        }
        // Fallback: add navigation from explicit includes
        else if (input.include && input.include.length > 0) {
          const includeLabels = input.include.map((inc) => {
            const fieldMeta = this.getFieldMetadata(input.entity || '', inc.field);
            if (fieldMeta?.targetEntity) {
              return this.getEntityLabel(fieldMeta.targetEntity, language);
            }
            return this.humanizeFieldName(inc.field);
          });
          if (includeLabels.length > 0) {
            const includeChain = includeLabels.join(' → ');
            action += ' ' + interpolate(templates.query_entities.withIncludes, { includeChain });
          }
        }

        // Add filters description
        if (input.filters && input.filters.length > 0) {
          filters = this.formatFilters(input.filters, input.entity || '', language);
          const filterList = filters
            .map((f) => `${f.fieldLabel} ${f.operatorLabel} ${f.valueLabel || f.value}`)
            .join(', ');
          action += ' ' + interpolate(templates.query_entities.withFilters, { filterList });
        }

        // Format result
        const data = output.data as { results?: unknown[]; hasMore?: boolean } | undefined;
        resultCount = Array.isArray(data?.results) ? data.results.length : 0;
        hasMore = data?.hasMore || false;

        result = hasMore
          ? interpolate(templates.query_entities.resultWithMore, {
              count: resultCount,
              entityLabel,
            })
          : interpolate(templates.query_entities.result, { count: resultCount, entityLabel });
        break;
      }

      case 'count_entities': {
        action = interpolate(templates.count_entities.base, { entityLabel });

        // Determine aggregation type
        if (input.groupBy) {
          const fieldLabel = this.getFieldLabel(input.entity || '', input.groupBy, language);
          action += ' ' + interpolate(templates.count_entities.withGroupBy, { fieldLabel });
          aggregation = { type: 'groupBy', field: input.groupBy, fieldLabel };
        } else if (input.countRelation) {
          const relationLabel = this.getFieldLabel(
            input.entity || '',
            input.countRelation,
            language
          );
          action += ' ' + interpolate(templates.count_entities.withCountRelation, { relationLabel });
          aggregation = { type: 'countRelation', field: input.countRelation, fieldLabel: relationLabel };
        } else if (input.groupByCount) {
          const fieldLabel = this.getFieldLabel(input.entity || '', input.groupByCount, language);
          aggregation = { type: 'groupByCount', field: input.groupByCount, fieldLabel };
        } else {
          aggregation = { type: 'count' };
        }

        // Add having description
        if (input.having && aggregation) {
          const operatorLabel = getOperatorLabel(input.having.operator, language);
          action +=
            ' ' +
            interpolate(templates.count_entities.withHaving, {
              operatorLabel,
              value: input.having.value,
            });
          aggregation.having = {
            operator: input.having.operator,
            operatorLabel,
            value: input.having.value,
          };
        }

        // Add filters
        if (input.filters && input.filters.length > 0) {
          filters = this.formatFilters(input.filters, input.entity || '', language);
        }

        // Format result
        // count_entities returns different structures:
        // - Simple count: { totalCount }
        // - groupBy/countRelation: { groups, totalGroups }
        // - groupByCount: { distribution, totalGroups, totalRecords }
        const countData = output.data as
          | { totalCount?: number; groups?: unknown[]; distribution?: unknown[]; totalGroups?: number; totalMatching?: number }
          | undefined;
        if (input.groupBy || input.countRelation || input.groupByCount) {
          // Use totalGroups if available, otherwise count the array
          const groupsArray = countData?.groups || countData?.distribution;
          resultCount = countData?.totalGroups ?? (Array.isArray(groupsArray) ? groupsArray.length : 0);
          result = interpolate(templates.count_entities.resultGrouped, { count: resultCount });
        } else {
          resultCount = countData?.totalCount ?? countData?.totalMatching ?? 0;
          result = interpolate(templates.count_entities.result, { count: resultCount, entityLabel });
        }
        break;
      }

      case 'get_lookup_values': {
        action = interpolate(templates.get_lookup_values.base, { entityLabel });
        // The lookup tool returns { entity, values, count, hint }
        const lookupResult = output.data as { values?: unknown[]; count?: number } | undefined;
        resultCount = lookupResult?.count ?? (Array.isArray(lookupResult?.values) ? lookupResult.values.length : 0);
        result = interpolate(templates.get_lookup_values.result, { count: resultCount });
        break;
      }

      case 'search_documents': {
        action = interpolate(templates.search_documents.base, { query: input.query || '' });
        const docData = output.data as { results?: unknown[] } | undefined;
        resultCount = Array.isArray(docData?.results) ? docData.results.length : 0;
        result = interpolate(templates.search_documents.result, { count: resultCount });
        break;
      }

      case 'next_page': {
        action = templates.next_page.base;
        const pageData = output.data as { results?: unknown[] } | undefined;
        resultCount = Array.isArray(pageData?.results) ? pageData.results.length : 0;
        result = interpolate(templates.next_page.result, { count: resultCount });
        break;
      }

      default:
        action = toolName;
        result = output.success ? 'OK' : output.error || 'Error';
    }

    return {
      tool: toolName,
      toolLabel,
      action,
      entity: input.entity || '',
      entityLabel,
      filters,
      aggregation,
      result,
      resultCount,
      hasMore,
      durationMs,
    };
  }

  private formatFilters(
    filters: Array<{
      field: string;
      operator: string;
      value: unknown;
      relationMode?: string;
    }>,
    entity: string,
    language: string
  ): FilterExplanation[] {
    return filters.map((f) => {
      const fieldLabel = this.getFieldLabel(entity, f.field, language);
      const operatorLabel = getOperatorLabel(f.operator, language);
      const value = String(f.value);

      // Try to resolve lookup value label
      let valueLabel: string | undefined;

      // For nested fields like "works.authors.author.gender",
      // infer the lookup entity from the last part of the field name
      const parts = f.field.split('.');
      const lastFieldName = parts[parts.length - 1];
      const inferredEntityName = lastFieldName.charAt(0).toUpperCase() + lastFieldName.slice(1);

      // Try inferred entity name first (e.g., "gender" -> "Gender")
      let lookupMap = this.lookupCache.get(inferredEntityName);
      if (lookupMap) {
        valueLabel = lookupMap.get(value);
      }

      // Fallback to field metadata targetEntity
      if (!valueLabel) {
        const fieldMeta = this.getFieldMetadata(entity, f.field);
        if (fieldMeta?.targetEntity) {
          lookupMap = this.lookupCache.get(fieldMeta.targetEntity);
          if (lookupMap) {
            valueLabel = lookupMap.get(value);
          }
        }
      }

      const result: FilterExplanation = {
        field: f.field,
        fieldLabel,
        operator: f.operator,
        operatorLabel,
        value,
      };

      if (valueLabel) {
        result.valueLabel = valueLabel;
      }

      if (f.relationMode) {
        result.relationMode = f.relationMode as 'some' | 'every' | 'none';
      }

      return result;
    });
  }

  private generateSummary(language: string): string {
    const templates = getSummaryTemplates(language);

    if (this.calls.length === 0) {
      return '';
    }

    // Find the main entity being queried (excluding lookups)
    const mainCalls = this.calls.filter(
      (c) => c.toolName === 'query_entities' || c.toolName === 'count_entities'
    );
    const hasLookup = this.calls.some((c) => c.toolName === 'get_lookup_values');
    const hasDocSearch = this.calls.some((c) => c.toolName === 'search_documents');

    if (hasDocSearch && mainCalls.length === 0) {
      return templates.documentSearch;
    }

    if (mainCalls.length === 0) {
      return interpolate(templates.multipleTools, { count: this.calls.length });
    }

    const mainCall = mainCalls[mainCalls.length - 1];
    const entityLabel = this.getEntityLabel(mainCall.input.entity || '', language);

    if (this.calls.length > 2 || (mainCalls.length > 1 && hasLookup)) {
      return interpolate(templates.multipleTools, { count: this.calls.length });
    }

    if (hasLookup && mainCalls.length === 1) {
      return interpolate(templates.withLookup, { entityLabel });
    }

    if (mainCall.toolName === 'count_entities') {
      return interpolate(templates.singleCount, { entityLabel });
    }

    return interpolate(templates.singleQuery, { entityLabel });
  }

  private getEntityLabel(entityName: string, language: string): string {
    if (!this.schemaMetadata || !entityName) {
      return entityName;
    }

    const entity = this.schemaMetadata.entities.find((e) => e.name === entityName);
    if (!entity?.labels) {
      return entityName;
    }

    const labels = entity.labels[language] || entity.labels['es'];
    return labels?.p || labels?.s || entityName;
  }

  private getFieldLabel(entityName: string, fieldName: string, language: string): string {
    // For nested fields like "works.authors.author.gender", use the last part
    const parts = fieldName.split('.');
    const lastFieldName = parts[parts.length - 1];

    // Try to find as an entity first (for lookup fields like "gender" -> "Gender")
    const entityMatch = this.findEntityByFieldName(lastFieldName);
    if (entityMatch?.labels) {
      const labels = entityMatch.labels[language] || entityMatch.labels['es'];
      if (labels?.s || labels?.p) {
        return labels.s || labels.p || lastFieldName;
      }
    }

    // Try to find in entity fields
    const fieldMeta = this.getFieldMetadata(entityName, fieldName);
    if (fieldMeta?.labels) {
      const labels = fieldMeta.labels[language] || fieldMeta.labels['es'];
      if (labels?.s) {
        return labels.s;
      }
    }

    // Fallback: humanize the last part
    return this.humanizeFieldName(lastFieldName);
  }

  private getFieldMetadata(
    entityName: string,
    fieldName: string
  ): EntityMetadata['fields'][0] | undefined {
    if (!this.schemaMetadata || !entityName) {
      return undefined;
    }

    const entity = this.schemaMetadata.entities.find((e) => e.name === entityName);
    if (!entity?.fields) {
      return undefined;
    }

    // For nested fields, take the first part to get the relation
    const baseName = fieldName.split('.')[0];
    return entity.fields.find((f) => f.name === baseName);
  }

  /**
   * Find an entity by field name (e.g., "gender" -> "Gender" entity)
   */
  private findEntityByFieldName(fieldName: string): EntityMetadata | undefined {
    if (!this.schemaMetadata) {
      return undefined;
    }

    // Capitalize first letter to match entity naming convention
    const entityName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    return this.schemaMetadata.entities.find((e) => e.name === entityName);
  }

  /**
   * Get the label for a navigation path segment.
   * Navigates through the schema following the relation path and returns
   * the localized label of the target entity.
   *
   * Example: entity="Edition", pathSegments=["works", "authors"]
   * - Edition.works -> MusicalWork -> label: "Obras"
   * - MusicalWork.authors -> WorkAuthor (but target is AuthorComposer) -> label: "Autores"
   */
  private getNavigationSegmentLabel(
    startEntity: string,
    pathSegments: string[],
    language: string
  ): string | undefined {
    if (!this.schemaMetadata || pathSegments.length === 0) {
      return undefined;
    }

    let currentEntity = this.schemaMetadata.entities.find((e) => e.name === startEntity);
    if (!currentEntity) {
      return undefined;
    }

    // Navigate through each segment to find the target entity
    for (const segment of pathSegments) {
      const field = currentEntity.fields?.find((f) => f.name === segment);
      if (!field || !field.targetEntity) {
        // Try humanizing the segment name as fallback
        return this.humanizeFieldName(segment);
      }

      // Move to target entity
      currentEntity = this.schemaMetadata.entities.find((e) => e.name === field.targetEntity);
      if (!currentEntity) {
        return this.humanizeFieldName(segment);
      }
    }

    // Return the label of the final target entity (plural form preferred)
    if (currentEntity.labels) {
      const labels = currentEntity.labels[language] || currentEntity.labels['es'];
      return labels?.p || labels?.s || currentEntity.name;
    }

    return currentEntity.name;
  }

  /**
   * Humanize a field name for display (e.g., "firstName" -> "First Name")
   */
  private humanizeFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }
}
