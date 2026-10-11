/**
 * Vector Store Interface
 *
 * Abstract interface for vector storage and similarity search (pgvector)
 */

import { VectorSearchResult, VectorSearchOptions } from '../types';

/**
 * Context for audit fields (passed from service layer)
 */
export interface VectorStoreContextFields {
  tenantId: string;
  userId: string;
}

/**
 * Core interface for vector store operations
 */
export interface IVectorStore {
  /**
   * Set context for audit fields
   */
  setContext(context: VectorStoreContextFields): void;

  /**
   * Store a vector with its metadata
   */
  store(params: StoreVectorParams): Promise<string>;

  /**
   * Store multiple vectors in batch
   */
  storeBatch(params: StoreVectorParams[]): Promise<string[]>;

  /**
   * Search for similar vectors
   */
  search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  /**
   * Delete vectors by document ID
   */
  deleteByDocument(documentId: string): Promise<number>;

  /**
   * Delete a specific vector by chunk ID
   */
  deleteByChunk(chunkId: string): Promise<boolean>;
}

/**
 * Parameters for storing a vector
 */
export interface StoreVectorParams {
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Similarity metrics supported by pgvector
 */
export type SimilarityMetric = 'cosine' | 'euclidean' | 'inner_product';

/**
 * Configuration for vector store
 */
export interface VectorStoreConfig {
  /**
   * Table name for storing vectors (default: document_chunk)
   */
  tableName?: string;

  /**
   * Similarity metric to use (default: cosine)
   */
  similarityMetric?: SimilarityMetric;

  /**
   * Number of dimensions (must match embedding model)
   */
  dimensions: number;
}

/**
 * Index types for pgvector
 */
export type VectorIndexType = 'hnsw' | 'ivfflat' | 'none';

/**
 * HNSW index parameters
 */
export interface HnswIndexParams {
  m?: number;           // Max connections per layer (default: 16)
  efConstruction?: number; // Size of dynamic candidate list (default: 64)
}

/**
 * IVFFlat index parameters
 */
export interface IvfFlatIndexParams {
  lists?: number;       // Number of lists (default: 100)
}

/**
 * Error thrown by vector store operations
 */
export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}
