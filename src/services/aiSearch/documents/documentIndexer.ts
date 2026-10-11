/**
 * Document Indexer
 *
 * Coordinates the full document indexing pipeline:
 * 1. Extract text from document
 * 2. Chunk text into smaller pieces
 * 3. Generate embeddings for each chunk
 * 4. Store vectors in pgvector
 */

import { PrismaClient } from '../../../prisma/generated-client/client';
import { DocumentProcessor, extractContent } from './documentProcessor';
import { ProcessingOptions, IndexingResult, DocumentProcessingError } from './types';
import { EmbeddingService, createEmbeddingProvider } from '../embeddings';
import { createVectorStore, IVectorStore, VectorStoreContext } from '../vectorStore';
import { EmbeddingConfig } from '../types';

/**
 * Configuration for document indexer
 */
export interface DocumentIndexerConfig {
  embedding: EmbeddingConfig;
  vectorTableName?: string;
}

/**
 * Context for document indexer (passed to vector store for audit fields)
 */
export interface DocumentIndexerContext {
  tenantId: string;
  userId: string;
}

/**
 * Document Indexer Service
 */
export class DocumentIndexer {
  private prisma: PrismaClient;
  private processor: DocumentProcessor;
  private embeddingService: EmbeddingService;
  private vectorStore: IVectorStore;

  constructor(prisma: PrismaClient, config: DocumentIndexerConfig, context?: DocumentIndexerContext) {
    this.prisma = prisma;
    this.processor = new DocumentProcessor();

    const embeddingProvider = createEmbeddingProvider(config.embedding);
    this.embeddingService = new EmbeddingService(embeddingProvider);

    // Convert context for vector store
    const vectorContext: VectorStoreContext | undefined = context
      ? { tenantId: context.tenantId, userId: context.userId }
      : undefined;

    this.vectorStore = createVectorStore(
      prisma,
      {
        tableName: config.vectorTableName || 'document_chunk',
        dimensions: embeddingProvider.dimensions,
      },
      vectorContext
    );
  }

  /**
   * Set context for audit fields (can be called after construction)
   */
  setContext(context: DocumentIndexerContext): void {
    this.vectorStore.setContext({
      tenantId: context.tenantId,
      userId: context.userId,
    });
  }

  /**
   * Index a document from a file buffer
   */
  async indexDocument(
    documentId: string,
    buffer: Buffer,
    filename: string,
    options?: ProcessingOptions
  ): Promise<IndexingResult> {
    try {
      // 1. Extract text
      const extracted = await this.processor.extract(
        buffer,
        filename,
        documentId
      );

      // 2. Chunk and embed
      const { chunks, embeddings } = await this.embeddingService.chunkAndEmbed(
        extracted.text,
        {
          maxTokens: options?.maxTokensPerChunk || 500,
          overlapTokens: options?.overlapTokens || 50,
        }
      );

      // 3. Store vectors with document metadata
      const storeParams = chunks.map((chunk, index) => ({
        documentId,
        chunkIndex: index,
        content: chunk.content,
        embedding: embeddings[index].embedding,
        tokenCount: embeddings[index].tokenCount,
        metadata: {
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          ...(options?.contentType && { contentType: options.contentType }),
          ...(options?.documentName && { documentName: options.documentName }),
          ...chunk.metadata,
        },
      }));

      await this.vectorStore.storeBatch(storeParams);

      const totalTokens = embeddings.reduce((sum, e) => sum + e.tokenCount, 0);

      return {
        success: true,
        documentId,
        chunkCount: chunks.length,
        totalTokens,
      };
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        return {
          success: false,
          documentId,
          chunkCount: 0,
          totalTokens: 0,
          error: error.message,
        };
      }

      return {
        success: false,
        documentId,
        chunkCount: 0,
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Re-index a document (delete existing chunks and re-process)
   */
  async reindexDocument(
    documentId: string,
    buffer: Buffer,
    filename: string,
    options?: ProcessingOptions
  ): Promise<IndexingResult> {
    // Delete existing chunks
    await this.vectorStore.deleteByDocument(documentId);

    // Re-index
    return this.indexDocument(documentId, buffer, filename, options);
  }

  /**
   * Delete all chunks for a document
   */
  async deleteDocument(documentId: string): Promise<number> {
    return this.vectorStore.deleteByDocument(documentId);
  }

  /**
   * Search across indexed documents
   */
  async search(
    query: string,
    options?: {
      limit?: number;
      minScore?: number;
      documentIds?: string[];
    }
  ) {
    // Generate embedding for query (uses "query: " prefix for E5 models)
    const { embedding } = await this.embeddingService.embedQuery(query);

    // Search vector store
    return this.vectorStore.search(embedding, {
      limit: options?.limit || 10,
      minScore: options?.minScore || 0.7,
      filter: options?.documentIds
        ? { documentIds: options.documentIds }
        : undefined,
    });
  }
}

/**
 * Create a document indexer instance
 */
export function createDocumentIndexer(
  prisma: PrismaClient,
  config: DocumentIndexerConfig,
  context?: DocumentIndexerContext
): DocumentIndexer {
  return new DocumentIndexer(prisma, config, context);
}
