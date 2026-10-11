/**
 * Embedding Provider Interface
 *
 * Abstract interface for embedding providers (OpenAI, Voyage, local models)
 */

import { EmbeddingConfig, EmbeddingResult } from '../types';

/**
 * Core interface for embedding providers
 */
export interface IEmbeddingProvider {
  /**
   * Provider identifier
   */
  readonly providerCode: string;

  /**
   * Dimensions of the embedding vectors
   */
  readonly dimensions: number;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Generate embedding for a single text (document/passage)
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Generate embedding for a search query
   * Some models (like E5) use different prefixes for queries vs documents.
   * Default implementation falls back to regular embed().
   */
  embedQuery?(text: string): Promise<EmbeddingResult>;
}

/**
 * Factory function type for embedding providers
 */
export type EmbeddingProviderFactory = (config: EmbeddingConfig) => IEmbeddingProvider;

/**
 * Chunking strategy types (must match Haiku enum values)
 * - auto: Automatically detect document format and apply heuristics
 * - by_tokens: Fixed token-based chunking (default)
 * - by_regex: Split using custom regex pattern
 * - by_structure: Detect tables, lists, headings
 * - by_legal: Optimized for laws and decrees with hierarchical headings
 */
export type ChunkingStrategy = 'auto' | 'by_tokens' | 'by_regex' | 'by_structure' | 'by_legal';

/**
 * Text chunking options for document processing
 */
export interface ChunkingOptions {
  /**
   * Chunking strategy to use (default: Auto)
   */
  strategy?: ChunkingStrategy;

  /**
   * Maximum tokens per chunk (default: 500)
   */
  maxTokens?: number;

  /**
   * Overlap between chunks in tokens (default: 50)
   */
  overlapTokens?: number;

  /**
   * Separator to use for splitting (default: paragraph/sentence)
   * Used when strategy is ByTokens
   */
  separator?: 'paragraph' | 'sentence' | 'token';

  /**
   * Custom regex pattern for splitting sections
   * Used when strategy is ByRegex
   * Examples:
   * - '^Art\\.?\\s*\\d+' for articles in regulations
   * - '^\\d+\\.\\d+' for numbered sections (1.1, 1.2)
   * - '^#{1,3}\\s' for markdown headings
   */
  separatorRegex?: string;
}

/**
 * Result of chunking a document
 */
export interface ChunkResult {
  chunks: {
    content: string;
    tokenCount: number;
    startOffset: number;
    endOffset: number;
    metadata?: Record<string, unknown>;
  }[];
  totalTokens: number;
}

/**
 * Error thrown by embedding providers
 */
export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly providerCode: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}
