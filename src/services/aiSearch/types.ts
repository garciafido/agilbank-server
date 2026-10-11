/**
 * AI Search Module - Shared Types
 *
 * Core types for the AI-powered search system that combines:
 * - Structured search over entities (via existing services)
 * - Semantic search over documents (via pgvector)
 * - LLM orchestration with tenant-configurable providers
 */

// ============================================
// LLM Provider Types
// ============================================

export type LlmProviderCode = 'openai' | 'anthropic' | 'groq' | 'google' | 'ollama' | 'cerebras' | 'openrouter' | 'deepseek';

export interface LlmProviderConfig {
  providerCode: LlmProviderCode;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;  // Required for tool role
  toolCalls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmResponse {
  content: string;
  toolCalls?: LlmToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================
// Embedding Types
// ============================================

export type EmbeddingProviderCode = 'openai' | 'voyage' | 'local';

export interface EmbeddingConfig {
  providerCode: EmbeddingProviderCode;
  model?: string;
  apiKey?: string;
  baseUrl?: string;  // For OpenAI-compatible APIs (like Ollama)
  dimensions: number;
}

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

// ============================================
// Vector Search Types
// ============================================

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?: number;
  minScore?: number;
  filter?: {
    documentIds?: string[];
  };
}

// ============================================
// Document Processing Types
// ============================================

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface DocumentChunkData {
  content: string;
  embedding: number[];
  tokenCount: number;
  metadata?: {
    page?: number;
    section?: string;
    [key: string]: unknown;
  };
}

export interface DocumentProcessingResult {
  success: boolean;
  chunkCount?: number;
  error?: string;
}

// ============================================
// Tool Types (for LLM function calling)
// ============================================

export interface SearchToolDefinition {
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
}

export interface SearchToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type SearchToolHandler = (
  args: Record<string, unknown>,
  context: SearchContext
) => Promise<SearchToolResult>;

// ============================================
// Search Context & Orchestration
// ============================================

export interface SearchContext {
  tenantId: string;
  userId: string;
  language: string;
  permissions: string[];
  /** Conversation ID for stateful operations like pagination */
  conversationId?: string;
}

export interface SearchRequest {
  query: string;
  conversationId?: string;
  context: SearchContext;
  /**
   * AbortSignal for cancelling the request.
   * When aborted, all LLM calls and pending operations will be cancelled.
   */
  signal?: AbortSignal;
}

export interface SearchResponse {
  answer: string;
  sources: SearchSource[];
  conversationId: string;
  /** Language detected from user query (es, en, pt) */
  detectedLanguage?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface SearchSource {
  type: 'entity' | 'document';
  id: string;
  title: string;
  snippet?: string;
}

// ============================================
// Conversation Types
// ============================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: SearchSource[];
}

/**
 * State of the last query for pagination
 */
export interface QueryState {
  /** Entity being queried */
  entity: string;
  /** Original query arguments (include, orderBy, filters) */
  args: Record<string, unknown>;
  /** Current skip value for next page */
  currentSkip: number;
  /** Page size used */
  pageSize: number;
  /** Whether more results are available */
  hasMore: boolean;
}

export interface ConversationState {
  id: string;
  messages: ConversationMessage[];
  context?: Record<string, unknown>;
  /** Last query state for pagination */
  lastQueryState?: QueryState;
  startedAt: Date;
  lastMessageAt: Date;
}

// ============================================
// Streaming Types (for SSE)
// ============================================

export type StreamEventType =
  | 'thinking'    // Processing query
  | 'tool'        // Executing tool
  | 'delta'       // Text fragment
  | 'correction'  // Replace previous content (fake results detected)
  | 'explanation' // Query explanation (tool calls summary)
  | 'done'        // Completed
  | 'error';      // Error

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  payload?: unknown;
}

export interface ThinkingEvent extends StreamEvent {
  type: 'thinking';
}

export interface ToolEvent extends StreamEvent {
  type: 'tool';
  payload: {
    name: string;
    status: 'running' | 'done';
    count?: number;
    /** Elapsed time in milliseconds since query started (for showing real wait time) */
    elapsedMs?: number;
  };
}

export interface DeltaEvent extends StreamEvent {
  type: 'delta';
  payload: {
    content: string;
  };
}

export interface CorrectionEvent extends StreamEvent {
  type: 'correction';
  payload: {
    /** New content to replace all previous streamed content */
    content: string;
    /** Reason for the correction (for logging/debugging) */
    reason: 'fake_results' | 'security_violation';
  };
}

/**
 * Metrics collected during query execution
 */
export interface QueryMetrics {
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  /** Total wall clock time in ms */
  totalTimeMs: number;
  /** Time spent in LLM calls in ms */
  llmTimeMs: number;
  /** Time spent in tool executions in ms */
  toolsTimeMs: number;
  /** Time spent in RAG search in ms (null if no RAG) */
  ragTimeMs: number | null;
  /** Time to first token in ms (null if not tracked) */
  firstTokenMs: number | null;
  /** Number of LLM calls made */
  llmCallCount: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Number of RAG chunks retrieved (null if no RAG) */
  ragChunksCount: number | null;
}

export interface DoneEvent extends StreamEvent {
  type: 'done';
  payload: {
    conversationId: string;
    sources: SearchSource[];
    detectedLanguage?: string;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    /** Complete metrics for persistence */
    metrics?: QueryMetrics;
  };
}

export interface ErrorEvent extends StreamEvent {
  type: 'error';
  payload: {
    message: string;
  };
}

// ============================================
// Query Explanation Types
// ============================================

/**
 * Explanation of a single filter applied in a query
 */
export interface FilterExplanation {
  /** Field name (logical, not Prisma) */
  field: string;
  /** Localized field label */
  fieldLabel: string;
  /** Operator used (equals, contains, gt, etc.) */
  operator: string;
  /** Localized operator label (igual a, contiene, mayor que) */
  operatorLabel: string;
  /** Value used in filter */
  value: string;
  /** For lookups: the human-readable label instead of UUID */
  valueLabel?: string;
  /** For SET fields: the relation mode used */
  relationMode?: 'some' | 'every' | 'none';
}

/**
 * Explanation of aggregation parameters
 */
export interface AggregationExplanation {
  /** Type of aggregation */
  type: 'count' | 'groupBy' | 'countRelation' | 'groupByCount';
  /** Field being grouped or counted */
  field?: string;
  /** Localized field label */
  fieldLabel?: string;
  /** Having clause if present */
  having?: {
    operator: string;
    operatorLabel: string;
    value: number;
  };
}

/**
 * Explanation of a single tool execution step
 */
export interface ToolStepExplanation {
  /** Tool name (query_entities, count_entities, etc.) */
  tool: string;
  /** Localized tool display name */
  toolLabel: string;
  /** Human-readable action description */
  action: string;
  /** Entity being queried */
  entity: string;
  /** Localized entity label */
  entityLabel: string;
  /** Filters applied (if any) */
  filters?: FilterExplanation[];
  /** Aggregation info (if any) */
  aggregation?: AggregationExplanation;
  /** Human-readable result description */
  result: string;
  /** Number of results returned */
  resultCount?: number;
  /** Whether more results are available */
  hasMore?: boolean;
  /** Execution time in milliseconds */
  durationMs: number;
}

/**
 * Complete explanation of how a query was processed
 */
export interface QueryExplanation {
  /** One-line summary of what was done */
  summary: string;
  /** Detailed steps of tool executions */
  steps: ToolStepExplanation[];
  /** Total number of tool calls made */
  totalTools: number;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
  /** Token usage from LLM calls */
  tokenUsage?: {
    /** Input tokens (prompt) */
    promptTokens: number;
    /** Output tokens (completion) */
    completionTokens: number;
    /** Total tokens */
    totalTokens: number;
  };
}

/**
 * SSE event for query explanation
 */
export interface ExplanationEvent extends StreamEvent {
  type: 'explanation';
  payload: QueryExplanation;
}
