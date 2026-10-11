/**
 * AI Search Service
 *
 * Main orchestrator for AI-powered search with security enforcement.
 * Coordinates LLM, tools, and conversation management while ensuring
 * no unauthorized data is exposed.
 */

import { PrismaClient, Prisma } from '../../../prisma/generated-client/client';
import {
  SearchRequest,
  SearchContext,
  SearchSource,
  LlmMessage,
  LlmProviderConfig,
  EmbeddingConfig,
  StreamEvent,
  QueryExplanation,
} from '../types';
import { QueryExplanationCollector } from '../explanation';
import { createLlmProvider, ILlmProvider, ContextLengthError } from '../llmProviders';
import {
  ToolRegistry,
  createToolRegistry,
  createDocumentSearchTool,
  createEntityQueryTool,
  createAggregationTool,
  createNextPageTool,
  createLookupTool,
  createServiceContextFromSearch,
} from '../tools';
import { executeSecureGroupByNestedPath } from '../tools/secureRawSql';
import { DocumentIndexer, createDocumentIndexer } from '../documents';
import { generateSystemPrompt, SystemPromptOptions } from '../prompts';
import * as fs from 'fs';
import * as path from 'path';
import {
  getOrCreateConversation,
  addMessage,
  getHistory,
  setContext,
  getContext,
} from './conversationService';
import {
  classifyAmbiguity,
  formatClarificationResponse,
  AmbiguityClassification,
  AmbiguityType,
} from './ambiguityClassifier';
import {
  matchSchema,
  shouldSkipClassifier,
  getSchemaHint,
  SchemaMatchResult,
  detectLanguage as detectQueryLanguage,
} from '../../patay/schemaMatcher';
import { extractGlossaryTerms } from '../../patay/classifier';
import {
  SchemaMetadata,
  SecurityContext,
  VisibleSchema,
  ValidationResult,
} from '../security/types';
import {
  buildSecurityContext,
  filterSchema,
  validateResponse,
  validateSources,
  createSecurityAuditEntry,
} from '../security';
import { SchemaMetadataStore } from '../../../common/services/schemaMetadata';
import { SecurePrismaOps } from '../../../common/services/securePrismaOps';
import { MAX_GROUPBY_LIMIT } from '../constants';

/**
 * Pattern loaded from AiSearchPattern entity for prompt injection
 */
export interface LoadedPattern {
  id: string;
  name: string;
  description: string;
  pattern: string;
  pathTypes: string[] | null;
  tools: string[] | null;
  priority: number;
}

/**
 * Disambiguation info captured during query processing
 */
export interface DisambiguationInfo {
  hadDisambiguation: boolean;
  disambiguationType: AmbiguityType | null;
  disambiguationResponse: string | null;
}

/**
 * Write LLM communication log (overwrites on each request - keeps only last)
 *
 * Apagado salvo activación explícita: el archivo recibe el prompt completo y
 * las filas que devolvieron las tools, así que persiste en el filesystem del
 * servidor cualquier dato que llegue al modelo. Se enciende sólo para depurar,
 * con AI_SEARCH_LLM_FILE_LOG=true.
 */
function writeLlmLog(entry: {
  timestamp: string;
  provider: string;
  phase: 'request' | 'response' | 'error';
  messagesCount?: number;
  toolsCount?: number;
  messages?: Array<{ role: string; content: string }>;
  response?: { content?: string; toolCalls?: unknown[]; usage?: unknown };
  error?: string;
  durationMs?: number;
}): void {
  if (process.env.AI_SEARCH_LLM_FILE_LOG !== 'true') return;

  try {
    const logDir = path.join(process.cwd(), 'logs');
    const logFile = path.join(logDir, 'ai-search-llm.log');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logLine = `=== ${entry.phase.toUpperCase()} @ ${entry.timestamp} ===\n` +
      `Provider: ${entry.provider}\n` +
      (entry.messagesCount !== undefined ? `Messages: ${entry.messagesCount}\n` : '') +
      (entry.toolsCount !== undefined ? `Tools: ${entry.toolsCount}\n` : '') +
      (entry.durationMs !== undefined ? `Duration: ${entry.durationMs}ms\n` : '') +
      (entry.error ? `Error: ${entry.error}\n` : '') +
      (entry.response ? `Response:\n${JSON.stringify(entry.response, null, 2)}\n` : '') +
      '\n';

    // Append to keep full conversation flow (truncate if > 100KB)
    const stats = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (stats && stats.size > 100 * 1024) {
      fs.writeFileSync(logFile, logLine); // Reset if too large
    } else {
      fs.appendFileSync(logFile, logLine);
    }

    // On request phase, also write the full prompt to a separate file
    if (entry.phase === 'request' && entry.messages) {
      const promptFile = path.join(logDir, 'ai-search-prompt.log');
      const promptContent = entry.messages.map(m =>
        `=== ${m.role.toUpperCase()} ===\n${m.content}\n`
      ).join('\n');
      fs.writeFileSync(promptFile, `=== PROMPT @ ${entry.timestamp} ===\n\n${promptContent}`);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Detect fake results - LLM claims to show data but no tools were called
 * This happens with some models (DeepSeek/Qwen) that simulate tool execution
 */
const FAKE_RESULT_PATTERNS = [
  /mostrando\s+\d+/i,
  /encontr[ée]\s+\d+/i,
  /hay\s+\d+\s+(registros?|resultados?|autores?|obras?|compositores?)/i,
  /\d+\s+(registros?|resultados?|autores?|obras?)\s+(disponibles?|encontrados?|más)/i,
  /listando\s+\d+/i,
  /total\s+de\s+\d+/i,
];

function detectFakeResults(response: string, toolCallsExecuted: number): boolean {
  if (toolCallsExecuted > 0) return false;
  return FAKE_RESULT_PATTERNS.some(pattern => pattern.test(response));
}

const FAKE_RESULTS_ERROR_MESSAGE = 'No pude procesar tu consulta correctamente. Por favor, intenta reformularla de otra manera.';

/**
 * Tool call event for logging/debugging
 */
export interface ToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  result: { success: boolean; data?: unknown; error?: string };
  durationMs: number;
}

/**
 * Configuration for AI Search Service
 */
export interface AiSearchServiceConfig {
  llm: LlmProviderConfig;
  embedding: EmbeddingConfig;
  vectorTableName?: string;
  /** Schema metadata for security filtering */
  schemaMetadata?: SchemaMetadata;
  /** Schema metadata store for SecurePrismaOps */
  schemaMetadataStore: SchemaMetadataStore;
  /** Callback for tool call events (for logging/debugging) */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Callback to receive the system prompt (for debugging) */
  onSystemPrompt?: (prompt: string) => void;
  /**
   * Skip the ambiguity classifier pre-processing step.
   * When true, queries are sent directly to the main LLM without
   * checking for ambiguity first. Useful for evaluation to measure
   * raw tool selection accuracy.
   */
  skipAmbiguityClassifier?: boolean;
  /**
   * Ablation study: Exclude schema context from prompt.
   * When true, the schema-derived model context is omitted.
   * Used to evaluate the impact of generated schema information.
   */
  excludeSchema?: boolean;
  /**
   * Ablation study: Exclude BFS-generated examples from prompt.
   * When true, examples are always omitted (independent of A/B test).
   * Used for controlled ablation studies.
   */
  excludeExamples?: boolean;
  /**
   * Evaluation logging: Write structured JSON per query for failure analysis.
   * When true, creates logs/evaluation/*.json with full context for each query.
   */
  evaluationLogging?: boolean;
}

/**
 * AI Search Service with Security
 */
export class AiSearchService {
  private prisma: PrismaClient;
  private llmProvider: ILlmProvider;
  private toolRegistry: ToolRegistry;
  private documentIndexer: DocumentIndexer;
  private tenantId: string;
  private schemaMetadata: SchemaMetadata | null;
  private schemaMetadataStore: SchemaMetadataStore;
  private onToolCall?: (event: ToolCallEvent) => void;
  private onSystemPrompt?: (prompt: string) => void;
  private skipAmbiguityClassifier: boolean;
  private excludeSchema: boolean;
  private excludeExamples: boolean;
  private evaluationLogging: boolean;

  constructor(
    prisma: PrismaClient,
    tenantId: string,
    config: AiSearchServiceConfig
  ) {
    this.prisma = prisma;
    this.tenantId = tenantId;
    this.schemaMetadata = config.schemaMetadata || null;
    this.schemaMetadataStore = config.schemaMetadataStore;
    this.onToolCall = config.onToolCall;
    this.onSystemPrompt = config.onSystemPrompt;
    this.skipAmbiguityClassifier = config.skipAmbiguityClassifier || false;
    this.excludeSchema = config.excludeSchema || false;
    this.excludeExamples = config.excludeExamples || false;

    // Initialize LLM provider
    this.llmProvider = createLlmProvider(tenantId, config.llm);

    // Initialize document indexer
    this.documentIndexer = createDocumentIndexer(prisma, {
      embedding: config.embedding,
      vectorTableName: config.vectorTableName,
    });

    // Initialize tool registry with built-in tools
    this.toolRegistry = createToolRegistry();
    this.toolRegistry.register(createDocumentSearchTool(this.documentIndexer, prisma));

    // Register entity query tools if schema metadata is available
    if (this.schemaMetadata) {
      this.registerEntityTools();
    }
  }

  /**
   * Register entity query and aggregation tools
   *
   * Uses SecurePrismaOps (LAYER 2) for all database access.
   * LAYER 1 validation happens in entityQueryTool and aggregationTool before calling these.
   */
  private registerEntityTools(): void {
    if (!this.schemaMetadata) return;

    // Create secure count function using SecurePrismaOps
    const executeSecureCount = async (
      entityName: string,
      where: Record<string, unknown>,
      context: SearchContext
    ): Promise<number> => {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);
      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        entityName as Prisma.ModelName,
        {}
      );

      return db.count({ where });
    };

    // Create secure groupBy function using SecurePrismaOps
    // Now uses SecurePrismaOps.groupBy which applies all security filters
    const executeSecureGroupBy = async (
      entityName: string,
      groupByField: string,
      where: Record<string, unknown>,
      context: SearchContext
    ): Promise<Array<{ value: unknown; count: number; label?: string }>> => {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);

      // Use SecurePrismaOps.groupBy - applies all security filters:
      // - Permission check (_retrieve)
      // - Tenant filtering (tenant_id_)
      // - User-scoped filtering (userScopedForRoles)
      // - Owner-scoped filtering (ownerScoped)
      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        entityName as Prisma.ModelName,
        {}
      );

      // Note: Prisma groupBy doesn't support orderBy with _count._all
      // We fetch all groups and sort in JS instead
      const results = await db.groupBy({
        by: [groupByField],
        where,
        _count: true,
      });

      // Sort by count descending
      results.sort((a: any, b: any) => (b._count || 0) - (a._count || 0));

      // Store total count before limiting (for accurate hasMore info)
      const totalBeforeLimit = results.length;
      const limitedResults = results.slice(0, MAX_GROUPBY_LIMIT);

      // If groupByField is a FK (ends with _id), try to fetch related entity labels
      const isFkField = groupByField.endsWith('_id');
      let labelMap: Map<string, string> | null = null;

      if (isFkField && this.schemaMetadata) {
        const relationFieldName = groupByField.slice(0, -3); // Remove '_id'
        const entityMeta = this.schemaMetadata.entities.find(e => e.name === entityName);
        const fieldMeta = entityMeta?.fields.find(f => f.name === relationFieldName);

        if (fieldMeta?.targetEntity) {
          // Get IDs to lookup
          const ids = limitedResults
            .map(r => r[groupByField] as string)
            .filter(Boolean);

          if (ids.length > 0) {
            // Find target entity metadata
            const targetMeta = this.schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);

            if (targetMeta) {
              try {
                // Use SecurePrismaOps for label lookup - applies all security filters
                const targetDb = new SecurePrismaOps(
                  serviceContext,
                  this.prisma,
                  this.schemaMetadataStore,
                  fieldMeta.targetEntity as Prisma.ModelName,
                  {}
                );

                // Use helper to build SELECT with proper multilang resolution
                const { buildDisplayFieldsSelect, buildLabelFromRecord } = await import('../tools/multilangHelper');
                const selectFields = buildDisplayFieldsSelect(targetMeta, context.language);

                const relatedRecords = await targetDb.findMany({
                  where: { id: { in: ids } },
                  select: selectFields,
                });

                // Build label map using helper
                labelMap = new Map();
                for (const rec of relatedRecords) {
                  const label = buildLabelFromRecord(rec, targetMeta, context.language);
                  if (label) {
                    labelMap.set(rec.id as string, label);
                  }
                }
              } catch {
                // Silently fail if can't lookup - just return IDs
              }
            }
          }
        }
      }

      const mappedResults = limitedResults.map((r: Record<string, unknown>) => {
        const id = r[groupByField] as string;
        return {
          value: id,
          count: r._count as number,
          ...(labelMap?.get(id) ? { label: labelMap.get(id) } : {}),
        };
      });

      return {
        results: mappedResults,
        totalBeforeLimit,
      };
    };

    // Create secure countRelation function using Prisma _count
    // This counts how many items are in a set relation (e.g., works per edition)
    const executeSecureCountRelation = async (
      entityName: string,
      relationField: string,
      where: Record<string, unknown>,
      context: SearchContext,
      pagination: { skip: number; limit: number }
    ): Promise<{ groups: Array<{ label: string; count: number }>; totalGroups: number }> => {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);

      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        entityName as Prisma.ModelName,
        {}
      );

      // Get entity metadata for display fields
      const entityMeta = this.schemaMetadata?.entities.find(e => e.name === entityName);
      if (!entityMeta) {
        throw new Error(`Entity ${entityName} not found in schema metadata`);
      }

      // Find display field for labels
      const { buildDisplayFieldsSelect, buildLabelFromRecord } = await import('../tools/multilangHelper');
      const selectFields = buildDisplayFieldsSelect(entityMeta, context.language);

      // Count total records (for pagination info)
      const totalGroups = await db.count({ where });

      // Fetch records with _count for the relation
      // Note: SecurePrismaOps.findMany passes through _count in select
      const results = await db.findMany({
        where,
        select: {
          ...selectFields,
          _count: { select: { [relationField]: true } },
        },
        orderBy: { [relationField]: { _count: 'desc' } },
        skip: pagination.skip,
        take: pagination.limit,
      });

      // Map results to expected format
      const groups = results.map((r: Record<string, unknown>) => {
        const label = buildLabelFromRecord(r, entityMeta, context.language);
        const countData = r._count as Record<string, number>;
        return {
          label: label || 'Sin nombre',
          count: countData?.[relationField] ?? 0,
        };
      });

      return { groups, totalGroups };
    };

    // Create secure groupByCount function
    // Returns distribution: how many records have each count value
    const executeSecureGroupByCount = async (
      entityName: string,
      relationField: string,
      where: Record<string, unknown>,
      context: SearchContext,
      pagination: { skip: number; limit: number }
    ): Promise<{
      groups: Array<{ countValue: number; numRecords: number }>;
      totalGroups: number;
      totalRecords: number;
    }> => {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);

      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        entityName as Prisma.ModelName,
        {}
      );

      // Step 1: Fetch all records with their counts (need all for accurate distribution)
      const allRecords = await db.findMany({
        where,
        select: {
          id: true,
          _count: { select: { [relationField]: true } },
        },
      });

      // Step 2: Build distribution map (count value -> number of records)
      const distribution = new Map<number, number>();
      for (const record of allRecords) {
        const countData = record._count as Record<string, number>;
        const countValue = countData?.[relationField] ?? 0;
        distribution.set(countValue, (distribution.get(countValue) ?? 0) + 1);
      }

      // Step 3: Convert to array and sort by count value descending
      const sortedGroups = Array.from(distribution.entries())
        .map(([countValue, numRecords]) => ({ countValue, numRecords }))
        .sort((a, b) => b.countValue - a.countValue);

      // Step 4: Apply pagination
      const totalGroups = sortedGroups.length;
      const totalRecords = allRecords.length;
      const paginatedGroups = sortedGroups.slice(pagination.skip, pagination.skip + pagination.limit);

      return { groups: paginatedGroups, totalGroups, totalRecords };
    };

    // Create secure countRelation grouped by field function
    // For queries like "obras por país del autor, solo autores con más de 3 obras"
    // Combines countRelation (count items in relation) with groupBy (group by another field)
    const executeSecureCountRelationGroupedBy = async (
      entityName: string,
      relationField: string,
      groupByField: string,
      where: Record<string, unknown>,
      context: SearchContext,
      having?: { operator: 'gt' | 'lt' | 'gte' | 'lte' | 'equals'; value: number },
      pagination?: { skip: number; limit: number }
    ): Promise<{
      groups: Array<{ groupValue: string; count: number }>;
      totalGroups: number;
      totalEntities: number;
    }> => {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);

      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        entityName as Prisma.ModelName,
        {}
      );

      // Get entity metadata for the groupBy field
      const entityMeta = this.schemaMetadata?.entities.find(e => e.name === entityName);
      const groupByFieldMeta = entityMeta?.fields.find(f => f.name === groupByField);

      // Build select with groupBy field and _count
      const select: Record<string, unknown> = {
        id: true,
        _count: { select: { [relationField]: true } },
      };

      // If groupBy field is a relation, include it with its display fields
      if (groupByFieldMeta?.targetEntity) {
        const { buildDisplayFieldsSelect } = await import('../tools/multilangHelper');
        const targetMeta = this.schemaMetadata?.entities.find(e => e.name === groupByFieldMeta.targetEntity);
        if (targetMeta) {
          select[groupByField] = { select: buildDisplayFieldsSelect(targetMeta, context.language) };
        } else {
          select[groupByField] = true;
        }
      } else {
        select[groupByField] = true;
      }

      // Fetch all records (we need all for accurate grouping after having filter)
      const allRecords = await db.findMany({
        where,
        select,
      });

      // Apply having filter if present
      let filteredRecords = allRecords;
      if (having) {
        filteredRecords = allRecords.filter((r: Record<string, unknown>) => {
          const countData = r._count as Record<string, number>;
          const countValue = countData?.[relationField] ?? 0;
          switch (having.operator) {
            case 'gt': return countValue > having.value;
            case 'gte': return countValue >= having.value;
            case 'lt': return countValue < having.value;
            case 'lte': return countValue <= having.value;
            case 'equals': return countValue === having.value;
            default: return true;
          }
        });
      }

      // Group by the groupBy field
      const { buildLabelFromRecord } = await import('../tools/multilangHelper');
      const groupMap = new Map<string, number>();

      for (const record of filteredRecords) {
        let groupKey: string;
        const groupValue = record[groupByField];

        if (groupByFieldMeta?.targetEntity && groupValue && typeof groupValue === 'object') {
          // Relation field - build label from the related record
          const targetMeta = this.schemaMetadata?.entities.find(e => e.name === groupByFieldMeta.targetEntity);
          if (targetMeta) {
            groupKey = buildLabelFromRecord(groupValue as Record<string, unknown>, targetMeta, context.language) || 'Sin valor';
          } else {
            groupKey = String(groupValue);
          }
        } else if (groupValue === null || groupValue === undefined) {
          groupKey = 'Sin valor';
        } else {
          groupKey = String(groupValue);
        }

        groupMap.set(groupKey, (groupMap.get(groupKey) ?? 0) + 1);
      }

      // Convert to array and sort by count descending
      const sortedGroups = Array.from(groupMap.entries())
        .map(([groupValue, count]) => ({ groupValue, count }))
        .sort((a, b) => b.count - a.count);

      // Apply pagination
      const totalGroups = sortedGroups.length;
      const totalEntities = filteredRecords.length;
      const skip = pagination?.skip ?? 0;
      const limit = pagination?.limit ?? 20;
      const paginatedGroups = sortedGroups.slice(skip, skip + limit);

      return { groups: paginatedGroups, totalGroups, totalEntities };
    };

    // Register entity query tool with SecurePrismaOps executor
    this.toolRegistry.register(
      createEntityQueryTool(this.schemaMetadata, async (entityName, operation, args, context, allowedFields) => {
        const serviceContext = await createServiceContextFromSearch(this.prisma, context);
        const db = new SecurePrismaOps(
          serviceContext,
          this.prisma,
          this.schemaMetadataStore,
          entityName as Prisma.ModelName,
          {}
        );

        const where = (args.where || {}) as Record<string, unknown>;
        const take = Math.min((args.take as number) || 10, 100);
        const skip = (args.skip as number) || 0;
        const orderBy = args.orderBy as Record<string, unknown> | undefined;
        const include = args.include as Record<string, unknown> | undefined;

        // Build select from allowed fields.
        // The denylist (`.secret` + `.onlyOnServer`) is applied here and not only
        // upstream: the caller's field list can come from defaults (displayFields)
        // that never pass through the schema-metadata field filter.
        const deniedFields = new Set(
          this.schemaMetadata?.entities.find(e => e.name === entityName)?.deniedFields ?? []
        );
        const select: Record<string, boolean | Record<string, unknown>> = {};
        for (const field of allowedFields) {
          if (deniedFields.has(field)) continue;
          select[field] = true;
        }

        // Merge include INTO select (SecurePrismaOps only processes select, ignores include)
        // This allows relations to be loaded through the secure select pruning
        if (include && typeof include === 'object') {
          for (const [relName, relValue] of Object.entries(include)) {
            select[relName] = relValue;
          }
        }

        // SecurePrismaOps.findMany handles:
        // - Permission check (_retrieve)
        // - Tenant filtering
        // - User-scoped filtering (userScopedForRoles)
        // - Select pruning for nested relations
        const results = await db.findMany({
          where,
          select,
          orderBy,
          take,
          skip,
        });

        return results;
      })
    );

    // Create secure groupBy for nested paths using Raw SQL
    // This enables queries like count_entities(entity="WorkAuthor", groupBy="author.gender")
    // SECURITY: Uses raw SQL with parameterized tenant_id_ and permission validation
    const executeSecureNestedGroupBy = async (
      entityName: string,
      nestedPath: string,
      where: Record<string, unknown>,
      context: SearchContext
    ): Promise<{
      groups: Array<{ value: string | null; count: number; label?: string }>;
      totalGroups: number;
    }> => {
      return executeSecureGroupByNestedPath(
        this.prisma,
        entityName,
        nestedPath,
        where,
        this.schemaMetadata!,
        context
      );
    };

    this.toolRegistry.register(
      createAggregationTool(
        this.schemaMetadata,
        executeSecureCount,
        executeSecureGroupBy,
        executeSecureCountRelation,
        executeSecureGroupByCount,
        executeSecureCountRelationGroupedBy,
        executeSecureNestedGroupBy
      )
    );

    // Register next_page tool - reuses query_entities and count_entities through the registry
    this.toolRegistry.register(
      createNextPageTool(
        async (entity, args, context) => {
          // Execute query_entities through the registry (for tables)
          const executionResult = await this.toolRegistry.execute('query_entities', { entity, ...args }, context);
          return executionResult.result;
        },
        async (entity, args, context) => {
          // Execute count_entities through the registry (for charts/aggregations)
          const executionResult = await this.toolRegistry.execute('count_entities', { entity, ...args }, context);
          return executionResult.result;
        }
      )
    );

    // Register lookup tool for fetching valid values from cacheable entities
    this.toolRegistry.register(
      createLookupTool(
        this.schemaMetadata,
        async (entityName, context) => {
          const serviceContext = await createServiceContextFromSearch(this.prisma, context);
          const db = new SecurePrismaOps(
            serviceContext,
            this.prisma,
            this.schemaMetadataStore,
            entityName as Prisma.ModelName,
            {}
          );

          // Get entity metadata for display fields
          const entityMeta = this.schemaMetadata?.entities.find(e => e.name === entityName);
          if (!entityMeta) {
            return [];
          }

          const { buildDisplayFieldsSelect, buildLabelFromRecord } = await import('../tools/multilangHelper');
          const selectFields = buildDisplayFieldsSelect(entityMeta, context.language);

          const records = await db.findMany({
            select: { id: true, ...selectFields },
            take: 100, // Limit for safety
          });

          return records.map((r: Record<string, unknown>) => {
            // id = real database ID (for filtering)
            // label = localized display value (for showing to user)
            const label = buildLabelFromRecord(r, entityMeta, context.language) || r.id as string;
            return {
              id: r.id as string,
              label,
            };
          });
        }
      )
    );
  }

  /**
   * Load active patterns from AiSearchPattern entity
   * Patterns are injected into the system prompt to improve LLM accuracy
   * Note: AiSearchPattern is sharedAcrossTenants (no tenant_id_ field)
   */
  private async loadActivePatterns(): Promise<LoadedPattern[]> {
    try {
      // Check if AiSearchPattern entity exists (may not exist in older projects)
      // Note: AiSearchPattern is sharedAcrossTenants, so no tenant filter needed
      const patterns = await (this.prisma as any).aiSearchPattern?.findMany({
        where: {
          active: true,
        },
        orderBy: { priority: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          pattern: true,
          pathTypes: true,
          tools: true,
          priority: true,
        },
      });

      if (!patterns) {
        return [];
      }

      return patterns.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        pattern: p.pattern,
        pathTypes: p.pathTypes || null,
        tools: p.tools || null,
        priority: p.priority,
      }));
    } catch {
      // AiSearchPattern entity doesn't exist or other error - return empty
      return [];
    }
  }

  /**
   * Process a search request with streaming response
   * Yields events as they occur for real-time UI updates
   */
  async *searchStream(request: SearchRequest): AsyncGenerator<StreamEvent> {
    const { query, conversationId, context, signal } = request;

    // Track query start time for elapsed time in tool events
    const queryStartTime = Date.now();

    // Helper to create events
    const event = (type: StreamEvent['type'], payload?: unknown): StreamEvent => ({
      type,
      timestamp: Date.now(),
      payload,
    });

    // Initialize explanation collector to track tool calls
    const explanationCollector = new QueryExplanationCollector(
      this.schemaMetadata ? { entities: this.schemaMetadata.entities } : undefined
    );

    yield event('thinking');

    // Track disambiguation info for evaluation
    const disambiguationInfo: DisambiguationInfo = {
      hadDisambiguation: false,
      disambiguationType: null,
      disambiguationResponse: null,
    };

    // Track applied patterns for evaluation
    let appliedPatternIds: string[] = [];

    try {
      // Load active patterns from database (for prompt injection)
      const patterns = await this.loadActivePatterns();
      appliedPatternIds = patterns.map(p => p.id);

      // Build security context
      const securityContext = this.buildSecurityContext(context);

      // Get or create conversation
      const conversation = getOrCreateConversation(conversationId);
      const contextWithConversation: SearchContext = {
        ...context,
        conversationId: conversation.id,
      };

      // Add user message to history
      addMessage(conversation.id, 'user', query);

      // =========================================================================
      // SCHEMA MATCHING + AMBIGUITY CLASSIFICATION (Pre-processing steps)
      // 1. Schema Matcher (deterministic) - resolves clear entity/field references
      // 2. Ambiguity Classifier (LLM-based) - handles semantic ambiguity
      // See: patay/docs/PATAY_V2_SPEC.md for theoretical foundation
      // =========================================================================

      // Skip classifier if we're awaiting a response to a previous clarification
      const conversationContext = getContext(conversation.id);
      const awaitingClarification = conversationContext?.awaitingClarification === true;

      if (awaitingClarification) {
        // Clear the flag - user has responded to clarification
        setContext(conversation.id, { awaitingClarification: false });
      }

      // Track schema match result for potential hint injection
      let schemaMatchResult: SchemaMatchResult | null = null;
      let schemaHint: string | null = null;

      // Only run pre-processing on fresh queries, not on clarification responses
      if (!awaitingClarification && !this.skipAmbiguityClassifier) {

        // -----------------------------------------------------------------------
        // STEP 1: Schema Matcher (deterministic, no LLM call)
        // Resolves clear entity/field references before LLM classifier
        // -----------------------------------------------------------------------
        if (this.schemaMetadata) {
          const detectedLang = detectQueryLanguage(query);
          schemaMatchResult = matchSchema(query, this.schemaMetadata, detectedLang);

          // Generate hint for main LLM if we got a match
          schemaHint = getSchemaHint(schemaMatchResult, detectedLang);

          if (schemaMatchResult.type !== 'no_match') {
            console.log(`[SchemaMatcher] ${schemaMatchResult.type}: ${JSON.stringify(schemaMatchResult.entity || schemaMatchResult.fields || schemaMatchResult.collision)}`);
          }
        }

        // -----------------------------------------------------------------------
        // STEP 2: Ambiguity Classifier (LLM-based)
        // Only runs if schema matcher didn't resolve clearly
        // -----------------------------------------------------------------------
        const skipClassifierDueToMatch = schemaMatchResult && shouldSkipClassifier(schemaMatchResult);

        if (!skipClassifierDueToMatch) {
          // Extract glossary terms from schema (entity labels, field labels, lookups)
          const glossaryResult = extractGlossaryTerms(securityContext.visibleSchema);

          const ambiguityResult = await classifyAmbiguity(
            query,
            this.llmProvider,
            securityContext.visibleSchema,
            glossaryResult.terms,
            signal
          );

          if (ambiguityResult.isAmbiguous && ambiguityResult.clarificationQuestion) {
            // Capture disambiguation info
            disambiguationInfo.hadDisambiguation = true;
            disambiguationInfo.disambiguationType = ambiguityResult.type;

            // Query is ambiguous - ask for clarification instead of executing
            const clarificationResponse = formatClarificationResponse(ambiguityResult);

            // Add assistant's clarification question to history
            addMessage(conversation.id, 'assistant', clarificationResponse);

            // Mark that we're awaiting clarification response
            setContext(conversation.id, { awaitingClarification: true });

            // Stream the clarification question to the user
            yield event('delta', { content: clarificationResponse });
            yield event('done', {
              answer: clarificationResponse,
              sources: [],
              conversationId: conversation.id,
              requiresClarification: true,
              ambiguityType: ambiguityResult.type,
              disambiguationInfo,
              patternsApplied: appliedPatternIds,
            });
            return;
          }
        } else {
          console.log(`[SchemaMatcher] Skipping ambiguity classifier - clear ${schemaMatchResult!.type} match`);
        }
      }
      // =========================================================================

      // Build messages for LLM with security-filtered schema and patterns
      const messages = this.buildSecureMessages(conversation.id, context, securityContext.visibleSchema, patterns);

      // Inject schema hint into last user message if available
      if (schemaHint && messages.length > 0) {
        const lastUserMsgIndex = messages.findLastIndex(m => m.role === 'user');
        if (lastUserMsgIndex !== -1) {
          messages[lastUserMsgIndex] = {
            ...messages[lastUserMsgIndex],
            content: `${schemaHint}\n\n${messages[lastUserMsgIndex].content}`,
          };
        }
      }

      // Get tool definitions
      const tools = this.toolRegistry.getDefinitions();

      // Log request
      const llmStartTime = Date.now();
      writeLlmLog({
        timestamp: new Date().toISOString(),
        provider: this.llmProvider.providerCode,
        phase: 'request',
        messagesCount: messages.length,
        toolsCount: tools.length,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      // First LLM call with tools (sync - we need to see if it wants to use tools)
      let response = await this.llmProvider.generateWithTools(messages, tools, {
        maxTokens: 2048,
        temperature: 0,
        signal,
      });

      // Record token usage and LLM time for explanation
      const firstLlmDurationMs = Date.now() - llmStartTime;
      if (response.usage) {
        explanationCollector.recordTokenUsage(response.usage);
      }
      explanationCollector.recordLlmTime(firstLlmDurationMs);

      // Log response
      writeLlmLog({
        timestamp: new Date().toISOString(),
        provider: this.llmProvider.providerCode,
        phase: 'response',
        response: { content: response.content, toolCalls: response.toolCalls, usage: response.usage },
        durationMs: firstLlmDurationMs,
      });

      const sources: SearchSource[] = [];
      let iterations = 0;
      const maxIterations = 5;

      // Handle tool calls (sync loop with progress events)
      while (response.toolCalls && response.toolCalls.length > 0 && iterations < maxIterations) {
        iterations++;

        for (const tc of response.toolCalls) {
          const toolName = tc.function.name;
          const args = JSON.parse(tc.function.arguments);

          // Emit tool running event with elapsed time since query start
          yield event('tool', { name: toolName, status: 'running', elapsedMs: Date.now() - queryStartTime });

          // Execute tool
          const toolStartTime = Date.now();
          const toolResult = await this.toolRegistry.execute(toolName, args, contextWithConversation);
          const toolDurationMs = Date.now() - toolStartTime;

          // Emit tool call event for logging/telemetry (all calls, including failures)
          this.onToolCall?.({ toolName, args, result: toolResult.result, durationMs: toolDurationMs });

          // Record tool call for explanation (only successful calls shown to user)
          explanationCollector.recordToolCall(toolName, args, toolResult.result, toolDurationMs);

          // Record RAG metrics for document search
          if (toolName === 'search_documents' && toolResult.result.success && toolResult.result.data) {
            const ragData = toolResult.result.data as { results?: unknown[] };
            const chunksCount = Array.isArray(ragData.results) ? ragData.results.length : 0;
            explanationCollector.recordRagMetrics(toolDurationMs, chunksCount);
          }

          // Extract count from result if available
          let count: number | undefined;
          if (toolResult.result.success && toolResult.result.data) {
            const data = toolResult.result.data as { results?: unknown[]; count?: number };
            count = data.count ?? data.results?.length;
          }

          // Emit tool done event
          yield event('tool', { name: toolName, status: 'done', count, elapsedMs: Date.now() - queryStartTime });

          // Collect sources from document search results
          if (toolResult.result.success && toolResult.result.data) {
            const data = toolResult.result.data as { results?: Array<{ documentId?: string; content?: string }> };
            if (data.results) {
              for (const r of data.results) {
                if (r.documentId && r.content) {
                  sources.push({
                    type: 'document',
                    id: r.documentId,
                    title: 'Documento',
                    snippet: r.content.substring(0, 200),
                  });
                }
              }
            }
          }

          // Add to messages
          messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: [tc],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            toolCallId: tc.id,
            toolName: tc.function.name,
          });
        }

        // Continue conversation (check if more tools needed)
        const continueStartTime = Date.now();
        response = await this.llmProvider.generateWithTools(messages, tools, {
          maxTokens: 2048,
          temperature: 0,
          signal,
        });

        // Record token usage and LLM time for explanation
        const continueDurationMs = Date.now() - continueStartTime;
        if (response.usage) {
          explanationCollector.recordTokenUsage(response.usage);
        }
        explanationCollector.recordLlmTime(continueDurationMs);

        writeLlmLog({
          timestamp: new Date().toISOString(),
          provider: this.llmProvider.providerCode,
          phase: 'response',
          response: { content: response.content, toolCalls: response.toolCalls, usage: response.usage },
          durationMs: continueDurationMs,
        });
      }

      // Final response generation
      // Use generateWithTools (not streamCompletion) to ensure DSML fallback is active
      // Keep handling tool calls until we get pure text
      const maxFinalIterations = 3;
      let finalIterations = 0;

      while (finalIterations < maxFinalIterations) {
        finalIterations++;

        // If response already has content and no tool calls, we're done
        if (response.content && (!response.toolCalls || response.toolCalls.length === 0)) {
          break;
        }

        // Call generateWithTools to get final response (has DSML fallback)
        const finalStartTime = Date.now();
        response = await this.llmProvider.generateWithTools(messages, tools, {
          maxTokens: 2048,
          temperature: 0,
          signal,
        });

        // Record token usage and LLM time for explanation
        const finalDurationMs = Date.now() - finalStartTime;
        if (response.usage) {
          explanationCollector.recordTokenUsage(response.usage);
        }
        explanationCollector.recordLlmTime(finalDurationMs);

        writeLlmLog({
          timestamp: new Date().toISOString(),
          provider: this.llmProvider.providerCode,
          phase: 'response',
          response: { content: response.content, toolCalls: response.toolCalls, usage: response.usage },
          durationMs: finalDurationMs,
        });

        // If LLM still wants to call tools, handle them
        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const tc of response.toolCalls) {
            const toolName = tc.function.name;
            const args = JSON.parse(tc.function.arguments);

            yield event('tool', { name: toolName, status: 'running', elapsedMs: Date.now() - queryStartTime });
            const toolStartTime = Date.now();
            const toolResult = await this.toolRegistry.execute(toolName, args, contextWithConversation);
            const toolDurationMs = Date.now() - toolStartTime;

            // Emit tool call event for logging/telemetry (all calls, including failures)
            this.onToolCall?.({ toolName, args, result: toolResult.result, durationMs: toolDurationMs });

            // Record tool call for explanation (only successful calls shown to user)
            explanationCollector.recordToolCall(toolName, args, toolResult.result, toolDurationMs);

            // Record RAG metrics for document search
            if (toolName === 'search_documents' && toolResult.result.success && toolResult.result.data) {
              const ragData = toolResult.result.data as { results?: unknown[] };
              const chunksCount = Array.isArray(ragData.results) ? ragData.results.length : 0;
              explanationCollector.recordRagMetrics(toolDurationMs, chunksCount);
            }

            let count: number | undefined;
            if (toolResult.result.success && toolResult.result.data) {
              const data = toolResult.result.data as { results?: unknown[]; count?: number };
              count = data.count ?? data.results?.length;
            }
            yield event('tool', { name: toolName, status: 'done', count, elapsedMs: Date.now() - queryStartTime });

            messages.push({
              role: 'assistant',
              content: '',
              toolCalls: [tc],
            });
            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult.result),
              toolCallId: tc.id,
              toolName: tc.function.name,
            });
          }
          iterations++;
        }
      }

      // Now emit the final text response
      const finalContent = response.content || '';
      const { language: detectedLanguage, content: responseWithoutLang } = this.extractLanguageTag(finalContent);

      // Check for fake results (LLM claims data but no tools were called)
      if (detectFakeResults(responseWithoutLang, iterations)) {
        addMessage(conversation.id, 'assistant', FAKE_RESULTS_ERROR_MESSAGE, []);
        explanationCollector.recordFirstToken();
        yield event('delta', { content: FAKE_RESULTS_ERROR_MESSAGE });

        const fakeResultMetrics = explanationCollector.getAllMetrics();
        yield event('done', {
          conversationId: conversation.id,
          sources: [],
          detectedLanguage: detectedLanguage || 'es',
          tokenUsage: fakeResultMetrics.tokenUsage || undefined,
          metrics: fakeResultMetrics,
          disambiguationInfo,
          patternsApplied: appliedPatternIds,
        });
      } else {
        const validationResult = this.validateResponse(responseWithoutLang, securityContext.visibleSchema);

        const accessibleDocumentIds = await this.getAccessibleDocumentIds(context.userId, context);
        const validatedSources = validateSources(sources, accessibleDocumentIds);

        addMessage(conversation.id, 'assistant', validationResult.sanitizedResponse, validatedSources);

        explanationCollector.recordFirstToken();
        yield event('delta', { content: validationResult.sanitizedResponse });

        // Emit explanation event if any tool calls were made
        if (explanationCollector.hasToolCalls()) {
          // Use language from tool calls first (LLM passes language param), then response tag, then context
          const explanationLanguage = explanationCollector.getDetectedLanguage() || detectedLanguage || context.language || 'es';
          const explanation = explanationCollector.generateExplanation(explanationLanguage);
          yield event('explanation', explanation);
        }

        const allMetrics = explanationCollector.getAllMetrics();
        yield event('done', {
          conversationId: conversation.id,
          sources: validatedSources,
          detectedLanguage: detectedLanguage || 'es',
          tokenUsage: allMetrics.tokenUsage || undefined,
          metrics: allMetrics,
          disambiguationInfo,
          patternsApplied: appliedPatternIds,
        });
      }
    } catch (error) {
      // Handle context length exceeded with friendly message
      if (error instanceof ContextLengthError) {
        yield event('error', {
          message: 'La conversación es muy larga. Por favor, inicia una nueva consulta.',
        });
      } else {
        yield event('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Extract language tag from LLM response
   * Format: [LANG:xx] where xx is es, en, or pt
   */
  private extractLanguageTag(content: string): { language: string | null; content: string } {
    const langMatch = content.match(/^\[LANG:(es|en|pt)\]\s*/i);
    if (langMatch) {
      return {
        language: langMatch[1].toLowerCase(),
        content: content.slice(langMatch[0].length).trim(),
      };
    }
    return { language: null, content };
  }

  /**
   * Build security context from search context
   */
  private buildSecurityContext(context: SearchContext): SecurityContext {
    if (!this.schemaMetadata) {
      // Return minimal context if no schema metadata
      return {
        userId: context.userId,
        tenantId: context.tenantId,
        permissions: new Set(context.permissions),
        language: context.language,
        visibleSchema: { entities: [], language: context.language },
      };
    }

    return buildSecurityContext(
      context.userId,
      context.tenantId,
      context.permissions,
      context.language,
      this.schemaMetadata
    );
  }

  /**
   * Build messages array for LLM with security-filtered schema and patterns
   */
  private buildSecureMessages(
    conversationId: string,
    context: SearchContext,
    visibleSchema: VisibleSchema,
    patterns: LoadedPattern[] = []
  ): LlmMessage[] {
    const history = getHistory(conversationId);

    const promptOptions: SystemPromptOptions = {
      availableTools: this.toolRegistry.list(),
      visibleSchema,
      queryPatterns: this.schemaMetadata?.queryPatterns,
      customInstructions: this.schemaMetadata?.customInstructions,
      // Ablation study flags
      excludeSchema: this.excludeSchema,
      excludeExamples: this.excludeExamples,
      // Patterns loaded from database
      patterns,
    };

    const systemPrompt = generateSystemPrompt(context, promptOptions);

    // Callback for debugging
    if (this.onSystemPrompt) {
      this.onSystemPrompt(systemPrompt);
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (excluding last message which is the current query)
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return messages;
  }

  /**
   * Validate LLM response for security violations
   */
  private validateResponse(response: string, visibleSchema: VisibleSchema): ValidationResult {
    if (!this.schemaMetadata) {
      return {
        safe: true,
        sanitizedResponse: response,
        violations: [],
      };
    }

    return validateResponse(response, visibleSchema, this.schemaMetadata);
  }

  /**
   * Get document IDs accessible to the user
   * Uses SecurePrismaOps to apply all security filters (tenant, userScoped, ownerScoped)
   */
  private async getAccessibleDocumentIds(
    userId: string,
    context: SearchContext
  ): Promise<Set<string>> {
    try {
      const serviceContext = await createServiceContextFromSearch(this.prisma, context);

      // Use SecurePrismaOps for proper security filtering
      const db = new SecurePrismaOps(
        serviceContext,
        this.prisma,
        this.schemaMetadataStore,
        'TenantDocument' as Prisma.ModelName,
        {}
      );

      const documents = await db.findMany({
        select: { id: true },
      });

      return new Set(documents.map((d: { id: string }) => d.id));
    } catch {
      // If TenantDocument is not available or permission denied, return empty set
      return new Set();
    }
  }

  /**
   * Log security violations for auditing
   * Writes to file to avoid exposing internal details in console output
   */
  private async logSecurityViolations(
    userId: string,
    tenantId: string,
    query: string,
    result: ValidationResult
  ): Promise<void> {
    const auditEntry = createSecurityAuditEntry(userId, tenantId, query, result.violations);

    // Write to security log file (never to console to avoid exposing internal details)
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const logDir = path.join(process.cwd(), 'logs');
      const logFile = path.join(logDir, 'ai-search-security.log');

      // Ensure log directory exists
      await fs.mkdir(logDir, { recursive: true });

      // Append to log file
      const logLine = JSON.stringify(auditEntry) + '\n';
      await fs.appendFile(logFile, logLine);
    } catch {
      // Silently fail if can't write log - never expose to console
    }

    // TODO: Store in AuditLog or dedicated security log table
  }

  /**
   * Get the document indexer for direct access
   */
  getDocumentIndexer(): DocumentIndexer {
    return this.documentIndexer;
  }

  /**
   * Register a custom tool
   */
  registerTool(tool: Parameters<ToolRegistry['register']>[0]): void {
    this.toolRegistry.register(tool);
  }

  /**
   * Update schema metadata (e.g., after schema changes)
   */
  setSchemaMetadata(metadata: SchemaMetadata): void {
    this.schemaMetadata = metadata;
  }
}

/**
 * Create an AI Search Service instance
 */
export function createAiSearchService(
  prisma: PrismaClient,
  tenantId: string,
  config: AiSearchServiceConfig
): AiSearchService {
  return new AiSearchService(prisma, tenantId, config);
}
