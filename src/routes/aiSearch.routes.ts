/**
 * AI Search REST Routes
 *
 * Provides SSE streaming endpoint for AI Search.
 * The main search is still available via GraphQL, but streaming requires REST.
 *
 * IMPORTANT: Conversations are persisted to the database after streaming completes.
 */

import { randomUUID } from 'crypto';
import { Router } from 'express';
import { createContext, ServiceContext } from '../service-context';
import { Request as ExpressRequest } from '../types/express';
import {
  AiSearchService,
  AiSearchServiceConfig,
  SchemaMetadata,
  resolveLlmConfigs,
  LlmConfigResolved,
  exportQueryState,
  getOrCreateConversation,
  importQueryState,
  addMessage,
  QueryState,
} from '../services/aiSearch';
import { SchemaMetadataStore } from '../common/services/schemaMetadata';
import { basePrisma } from '../prisma/client';
import { Prisma } from '../prisma/generated-client/client';
import schemaMetadata from '../services/aiSearch/schema-metadata.json';

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Array<{
    type: string;
    id: string;
    title: string;
    snippet?: string;
  }>;
}

interface StoredContext {
  paginationState?: QueryState;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface QueryMetrics {
  tokenUsage: TokenUsage | null;
  totalTimeMs: number;
  llmTimeMs: number;
  toolsTimeMs: number;
  ragTimeMs: number | null;
  firstTokenMs: number | null;
  llmCallCount: number;
  toolCallCount: number;
  ragChunksCount: number | null;
}

/**
 * Persist token usage and metrics to database and update tenant counters
 */
async function persistTokenUsage(
  tenantId: string,
  userId: string,
  provider: string,
  model: string,
  metrics: QueryMetrics,
  conversationId: string
): Promise<void> {
  const now = new Date();
  const usage = metrics.tokenUsage;

  // Skip if no token usage
  if (!usage || usage.totalTokens === 0) {
    return;
  }

  try {
    // Use transaction to ensure atomicity:
    // - Create usage record
    // - Increment tenant's monthly counter
    // Both succeed or both fail
    await basePrisma.$transaction(async (tx) => {
      await tx.tenantTokenUsage.create({
        data: {
          tenant_: { connect: { id: tenantId } },
          createdBy_: { connect: { id: userId } },
          provider,
          model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          conversation: { connect: { id: conversationId } },
          conversationUser: { connect: { id: userId } },
          timestamp: now,
          // Time metrics
          totalTimeMs: metrics.totalTimeMs,
          llmTimeMs: metrics.llmTimeMs,
          toolsTimeMs: metrics.toolsTimeMs,
          ragTimeMs: metrics.ragTimeMs,
          firstTokenMs: metrics.firstTokenMs,
          // Usage counters
          llmCallCount: metrics.llmCallCount,
          toolCallCount: metrics.toolCallCount,
          ragChunksCount: metrics.ragChunksCount,
          // System fields
          version_: randomUUID(),
          createdAt_: now,
          lastUpdatedAt_: now,
        },
      });

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          currentMonthTokens: { increment: usage.totalTokens },
        },
      });
    });
  } catch (error) {
    console.error('[AI Search Stream] Error persisting token usage:', error);
    // Don't fail the request - streaming was successful
  }
}

const router = Router();

// Cache for SchemaMetadataStore (shared across requests)
let schemaMetadataStore: SchemaMetadataStore | null = null;

function getSchemaMetadataStore(): SchemaMetadataStore {
  if (!schemaMetadataStore) {
    schemaMetadataStore = new SchemaMetadataStore();
    schemaMetadataStore.build();
  }
  return schemaMetadataStore;
}

/**
 * Build service config for a specific LLM config
 */
function buildServiceConfig(llmConfig: LlmConfigResolved): AiSearchServiceConfig & { debugFullMode?: boolean } {
  // Skip ambiguity classifier (for automated evaluation)
  const skipAmbiguityClassifier = process.env.AI_SEARCH_SKIP_AMBIGUITY_CLASSIFIER === 'true';

  // Ablation study flags (for evaluating schema/examples impact)
  // Default to true (include) - set to 'false' to exclude
  const excludeSchema = process.env.AI_SEARCH_INCLUDE_SCHEMA === 'false';
  const excludeExamples = process.env.AI_SEARCH_INCLUDE_EXAMPLES === 'false';

  // Evaluation logging: writes structured JSON per query for failure analysis
  const evaluationLogging = process.env.AI_SEARCH_EVALUATION_LOGGING === 'true';

  // Debug full mode: from DB config or env var (for detailed tool call logging)
  const debugFullMode = llmConfig.debugFullMode || process.env.AI_SEARCH_DEBUG_FULL === 'true';

  return {
    llm: {
      providerCode: llmConfig.providerCode as AiSearchServiceConfig['llm']['providerCode'],
      model: llmConfig.model,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      maxTokens: llmConfig.maxTokens || 4096,
      // Use temperature 0 for tool calling to reduce creative/unpredictable responses
      temperature: llmConfig.temperature ?? 0,
    },
    embedding: {
      providerCode: 'local',
      dimensions: 1024, // multilingual-e5-large (Transformers.js)
    },
    schemaMetadata: schemaMetadata as SchemaMetadata,
    schemaMetadataStore: getSchemaMetadataStore(),
    skipAmbiguityClassifier,
    // Ablation study flags
    excludeSchema,
    excludeExamples,
    // Evaluation logging for failure analysis
    evaluationLogging,
    // Debug mode for detailed tool call persistence
    debugFullMode,
  };
}

/**
 * POST /api/ai-search/stream
 *
 * Stream AI Search responses via Server-Sent Events.
 * Requires authentication via Bearer token.
 *
 * Request body:
 * - query: string (required) - The user's question
 * - conversationId: string (optional) - Continue existing conversation
 *
 * Evaluation mode fields (optional, for automated evaluation):
 * - evalRunId: string - Identifier for the evaluation run
 * - evalQueryIndex: number - Query index in the dataset
 * - evalExpectedTool: string - Expected tool name
 * - evalExpectedEntity: string - Expected entity name
 * - evalPathType: string - Path type classification
 *
 * Response: text/event-stream with events:
 * - thinking: Processing started
 * - tool: Tool execution progress
 * - delta: Text fragment
 * - done: Completed with metadata
 * - error: Error occurred
 */
router.post('/ai-search/stream', async (req, res) => {
  let context: ServiceContext | null = null;

  try {
    context = await createContext(req as ExpressRequest);
  } catch (contextError) {
    console.error('[AI Search Stream] Auth error:', contextError);
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!context?.currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const {
    query,
    conversationId,
    // Response tracking (for feedback)
    responseId,
    // Evaluation mode fields (optional)
    evalRunId,
    evalQueryIndex,
    evalExpectedTool,
    evalExpectedEntity,
    evalPathType,
  } = req.body;

  // Generate responseId if not provided by frontend
  const finalResponseId = responseId || randomUUID();

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Check if this is an evaluation request
  const isEvalMode = Boolean(evalRunId && evalExpectedTool && evalExpectedEntity);

  const tenantId = context.currentUser.tenant_id_;
  const userId = context.currentUser.id;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Get all available LLM configs ordered by priority (same as GraphQL resolver)
  const allConfigs = await resolveLlmConfigs(basePrisma, tenantId);

  if (allConfigs.length === 0) {
    res.write(`data: ${JSON.stringify({ type: 'error', timestamp: Date.now(), payload: { message: 'No hay configuración de LLM disponible para este tenant' } })}\n\n`);
    res.end();
    return;
  }

  // Extract permissions from roles
  const permissions: string[] = [];
  if (context.currentUser.roles) {
    for (const role of context.currentUser.roles) {
      if (role.permissions) {
        for (const perm of role.permissions) {
          permissions.push(perm.id);
        }
      }
    }
  }

  // Build search context
  const searchContext = {
    tenantId,
    userId,
    language: (req.headers['accept-language']?.split(',')[0]?.split('-')[0]) || 'es',
    permissions,
  };

  // Try first available config (streaming doesn't support automatic fallback yet)
  const llmConfig = allConfigs[0];
  const serviceConfig = buildServiceConfig(llmConfig);

  // Create AbortController to cancel LLM requests when client disconnects
  const abortController = new AbortController();
  const { signal } = abortController;

  // Listen for client disconnect to abort pending LLM operations
  let clientDisconnected = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
      console.log('[AI Search Stream] Client disconnected, aborting request');
    }
  });

  try {
    const now = new Date();

    // Check for existing conversation BEFORE streaming (to restore pagination state)
    const existingConversation = conversationId
      ? await basePrisma.aiSearchConversation.findFirst({
          where: {
            id: conversationId,
            createdBy_id_: userId,
            tenant_id_: tenantId,
          },
        })
      : null;

    // Restore conversation state if continuing an existing conversation
    if (existingConversation && conversationId) {
      getOrCreateConversation(conversationId);

      // Restore message history so LLM has full context
      const storedMessages = (existingConversation.messages as StoredMessage[]) || [];
      for (const msg of storedMessages) {
        addMessage(conversationId, msg.role, msg.content);
      }

      // Restore pagination state
      const storedContext = existingConversation.context as StoredContext | null;
      if (storedContext?.paginationState) {
        importQueryState(conversationId, storedContext.paginationState);
      }
    }

    // Capture streaming content and metadata for persistence
    let streamedContent = '';
    let finalConversationId: string | null = null;
    let finalSources: StoredMessage['sources'] = [];
    let finalMetrics: QueryMetrics | null = null;

    // Capture disambiguation info for evaluation
    let disambiguationInfo: {
      hadDisambiguation: boolean;
      disambiguationType: string | null;
      disambiguationResponse: string | null;
    } = {
      hadDisambiguation: false,
      disambiguationType: null,
      disambiguationResponse: null,
    };

    // Capture patterns applied for evaluation
    let patternsApplied: string[] = [];

    // Capture explanation for AiSearchResponse
    let explanation: Record<string, unknown> | null = null;

    // Capture tool calls for evaluation (with args from 'start' event)
    const capturedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    // Track pending tool calls to capture args from 'start' event
    const pendingToolArgs: Map<string, Record<string, unknown>> = new Map();

    // Detailed tool calls for debug mode persistence (AiSearchToolCall)
    interface DetailedToolCall {
      sequence: number;
      toolName: string;
      pattern: string | null;
      navigationPath: string | null;
      arguments: Record<string, unknown>;
      result: unknown;
      durationMs: number;
      success: boolean;
      errorMessage: string | null;
    }
    const detailedToolCalls: DetailedToolCall[] = [];
    let toolCallSequence = 0;

    // Create service with tool call callback for debug mode
    const aiSearchService = new AiSearchService(
      basePrisma,
      tenantId,
      {
        ...serviceConfig,
        // Capture detailed tool calls when debugFullMode is active
        onToolCall: serviceConfig.debugFullMode ? (event) => {
          toolCallSequence++;
          const reasoning = event.args?.reasoning as { pattern?: string; path?: string } | undefined;
          detailedToolCalls.push({
            sequence: toolCallSequence,
            toolName: event.toolName,
            pattern: reasoning?.pattern || null,
            navigationPath: reasoning?.path || null,
            arguments: event.args,
            result: event.result,
            durationMs: event.durationMs,
            success: event.result?.success ?? false,
            errorMessage: event.result?.error || null,
          });
        } : undefined,
      }
    );

    // Stream events
    for await (const event of aiSearchService.searchStream({
      query,
      conversationId,
      context: searchContext,
      signal,
    })) {
      // Check if client disconnected before writing
      if (clientDisconnected) {
        console.log('[AI Search Stream] Stopping stream due to client disconnect');
        break;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Flush if available (for compression middleware compatibility)
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }

      // Capture content for persistence
      if (event.type === 'delta' && event.payload?.content) {
        streamedContent += event.payload.content;
      }
      // Capture tool calls for evaluation
      if (event.type === 'tool' && event.payload?.name) {
        const toolName = event.payload.name;
        if (event.payload.status === 'start' && event.payload.args) {
          // Capture args from 'start' event
          pendingToolArgs.set(toolName, event.payload.args as Record<string, unknown>);
        } else if (event.payload.status === 'done') {
          // Complete the tool call capture with args from 'start'
          const args = pendingToolArgs.get(toolName) || {};
          capturedToolCalls.push({ name: toolName, args });
          pendingToolArgs.delete(toolName);
        }
      }
      if (event.type === 'done' && event.payload) {
        finalConversationId = event.payload.conversationId || null;
        finalSources = event.payload.sources || [];
        // Capture metrics from done event (includes tokenUsage and all time/counter metrics)
        if (event.payload.metrics) {
          finalMetrics = event.payload.metrics as QueryMetrics;
        }
        // Capture disambiguation info for evaluation
        if (event.payload.disambiguationInfo) {
          disambiguationInfo = event.payload.disambiguationInfo as typeof disambiguationInfo;
        }
        // Capture patterns applied for evaluation
        if (event.payload.patternsApplied) {
          patternsApplied = event.payload.patternsApplied as string[];
        }
        // Capture explanation for AiSearchResponse
        if (event.payload.explanation) {
          explanation = event.payload.explanation as Record<string, unknown>;
        }
      }
    }

    // Persist conversation to database after streaming completes
    if (finalConversationId && streamedContent) {
      try {
        // Build messages array
        const userMessage: StoredMessage = {
          role: 'user',
          content: query,
          timestamp: now.toISOString(),
        };

        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: streamedContent,
          timestamp: new Date().toISOString(),
          sources: finalSources,
        };

        // Export pagination state after streaming
        const paginationState = exportQueryState(finalConversationId);
        const updatedContext: StoredContext = {
          ...(existingConversation?.context as StoredContext || {}),
          paginationState: paginationState || undefined,
        };

        if (existingConversation) {
          // Update existing conversation
          const existingMessages = (existingConversation.messages as StoredMessage[]) || [];
          const updatedMessages = [...existingMessages, userMessage, assistantMessage];

          await basePrisma.aiSearchConversation.update({
            where: { id: existingConversation.id },
            data: {
              lastMessageAt: now,
              messageCount: updatedMessages.length,
              messages: updatedMessages as unknown as Prisma.InputJsonValue,
              context: updatedContext as unknown as Prisma.InputJsonValue,
              version_: randomUUID(),
              lastUpdatedAt_: now,
              lastUpdatedBy_: { connect: { id: userId } },
            },
          });
        } else {
          // Create new conversation
          await basePrisma.aiSearchConversation.create({
            data: {
              id: finalConversationId,
              startedAt: now,
              lastMessageAt: now,
              messageCount: 2,
              messages: [userMessage, assistantMessage] as unknown as Prisma.InputJsonValue,
              context: updatedContext as unknown as Prisma.InputJsonValue,
              tenant_: { connect: { id: tenantId } },
              version_: randomUUID(),
              createdAt_: now,
              createdBy_: { connect: { id: userId } },
              lastUpdatedAt_: now,
              lastUpdatedBy_: { connect: { id: userId } },
            },
          });
        }

        // Persist token usage and metrics AFTER conversation exists
        if (finalMetrics) {
          await persistTokenUsage(
            tenantId,
            userId,
            llmConfig.providerCode,
            llmConfig.model,
            finalMetrics,
            finalConversationId
          );
        }

        // Create AiSearchResponse for feedback tracking
        try {
          // Build tool calls data for debug mode
          const toolCallsData = serviceConfig.debugFullMode && detailedToolCalls.length > 0
            ? detailedToolCalls.map(tc => ({
                id: randomUUID(),
                sequence: tc.sequence,
                toolName: tc.toolName,
                pattern: tc.pattern,
                navigationPath: tc.navigationPath,
                toolArguments: tc.arguments as Prisma.InputJsonValue,
                result: tc.result as Prisma.InputJsonValue,
                durationMs: tc.durationMs,
                success: tc.success,
                errorMessage: tc.errorMessage,
                // System fields
                tenant_: { connect: { id: tenantId } },
                version_: randomUUID(),
                createdAt_: now,
                createdBy_: { connect: { id: userId } },
                lastUpdatedAt_: now,
                lastUpdatedBy_: { connect: { id: userId } },
              }))
            : undefined;

          await basePrisma.aiSearchResponse.create({
            data: {
              id: finalResponseId,
              conversation: { connect: { id: finalConversationId } },
              query,
              response: streamedContent,
              sources: finalSources as unknown as Prisma.InputJsonValue,
              explanation: explanation as Prisma.InputJsonValue,
              // Tool calls for debug mode (subentities)
              ...(toolCallsData && { toolCalls: { create: toolCallsData } }),
              // System fields
              tenant_: { connect: { id: tenantId } },
              version_: randomUUID(),
              createdAt_: now,
              createdBy_: { connect: { id: userId } },
              lastUpdatedAt_: now,
              lastUpdatedBy_: { connect: { id: userId } },
            },
          });
        } catch (responseError) {
          console.error('[AI Search Stream] Error creating AiSearchResponse:', responseError);
          // Don't fail - response tracking is non-critical
        }
      } catch (persistError) {
        console.error('[AI Search Stream] Error persisting conversation:', persistError);
        // Don't fail the request - streaming was successful, just persistence failed
      }
    }

    // Persist evaluation results to AiSearchAutoEval (only in evaluation mode)
    if (isEvalMode && finalConversationId) {
      try {
        // Get the first tool call (primary tool selection)
        const firstToolCall = capturedToolCalls[0] || null;
        const actualTool = firstToolCall?.name || null;
        const actualEntity = (firstToolCall?.args?.entity as string) || null;

        // Calculate L1 and L2 accuracy
        const l1Pass = actualTool === evalExpectedTool;
        const l2Pass = l1Pass && actualEntity === evalExpectedEntity;

        // Determine experimental condition from environment
        const includeSchema = process.env.AI_SEARCH_INCLUDE_SCHEMA !== 'false';
        const includeExamples = process.env.AI_SEARCH_INCLUDE_EXAMPLES !== 'false';
        let condition: string;
        if (!includeSchema && !includeExamples) {
          condition = 'C0_baseline';
        } else if (includeSchema && !includeExamples) {
          condition = 'C1_schema';
        } else {
          condition = 'C2_full';
        }

        await basePrisma.aiSearchAutoEval.create({
          data: {
            runId: evalRunId,
            queryIndex: evalQueryIndex || 0,
            condition,
            query,
            expectedTool: evalExpectedTool,
            expectedEntity: evalExpectedEntity,
            actualTool,
            actualEntity,
            l1Pass,
            l2Pass,
            toolCalls: capturedToolCalls as unknown as Prisma.InputJsonValue,
            response: streamedContent,
            pathType: evalPathType || null,
            evaluatedAt: now,
            // Disambiguation fields (captured from service)
            hadDisambiguation: disambiguationInfo.hadDisambiguation,
            disambiguationType: disambiguationInfo.disambiguationType,
            disambiguationResponse: disambiguationInfo.disambiguationResponse,
            // Patterns applied (captured from service)
            patternsApplied: patternsApplied,
            // System fields
            tenant_: { connect: { id: tenantId } },
            version_: randomUUID(),
            createdAt_: now,
            createdBy_: { connect: { id: userId } },
            lastUpdatedAt_: now,
            lastUpdatedBy_: { connect: { id: userId } },
          },
        });
      } catch (evalPersistError) {
        console.error('[AI Search Stream] Error persisting evaluation:', evalPersistError);
        // Don't fail the request - streaming was successful
      }
    }

    // Signal end of stream
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[AI Search Stream] Error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      timestamp: Date.now(),
      payload: { message: error instanceof Error ? error.message : 'Unknown error' },
    })}\n\n`);
    res.end();
  }
});

/**
 * PATCH /api/ai-search/response/:responseId/rating
 *
 * Update the rating for an AI Search response (for A/B testing feedback).
 * Requires authentication via Bearer token.
 *
 * Request body:
 * - rating: 'ThumbsUp' | 'ThumbsDown' (required)
 */
router.patch('/ai-search/response/:responseId/rating', async (req, res) => {
  let context: ServiceContext | null = null;

  try {
    context = await createContext(req as ExpressRequest);
  } catch (contextError) {
    console.error('[AI Search Rating] Auth error:', contextError);
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!context?.currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { responseId } = req.params;
  const { rating } = req.body;

  if (!responseId) {
    return res.status(400).json({ error: 'Response ID is required' });
  }

  // Accept both snake_case (from GraphQL enum) and PascalCase formats
  const validRatings = ['thumbs_up', 'thumbs_down', 'ThumbsUp', 'ThumbsDown'];
  if (!rating || !validRatings.includes(rating)) {
    return res.status(400).json({ error: 'Rating must be thumbs_up or thumbs_down' });
  }

  // Normalize to snake_case (matches GraphQL enum / Prisma schema)
  const normalizedRating = rating === 'ThumbsUp' ? 'thumbs_up'
    : rating === 'ThumbsDown' ? 'thumbs_down'
    : rating;

  const userId = context.currentUser.id;
  const tenantId = context.currentUser.tenant_id_;

  try {
    // Verify the response exists and belongs to this tenant
    const existingResponse = await basePrisma.aiSearchResponse.findFirst({
      where: {
        id: responseId,
        tenant_id_: tenantId,
      },
    });

    if (!existingResponse) {
      return res.status(404).json({ error: 'Response not found' });
    }

    // Update the rating
    await basePrisma.aiSearchResponse.update({
      where: { id: responseId },
      data: {
        rating: normalizedRating,
        evaluatedAt: new Date(),
        evaluatedBy: { connect: { id: userId } },
        version_: randomUUID(),
        lastUpdatedAt_: new Date(),
        lastUpdatedBy_: { connect: { id: userId } },
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[AI Search Rating] Error:', error);
    return res.status(500).json({ error: 'Failed to save rating' });
  }
});

export default router;
