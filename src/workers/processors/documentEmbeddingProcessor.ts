/**
 * Document Embedding Processor
 *
 * Processes documents from the embedding queue:
 * 1. Download document from storage
 * 2. Extract text content
 * 3. Chunk text and generate embeddings
 * 4. Store vectors in DocumentChunk
 * 5. Update document status
 */

import { basePrisma } from '../../prisma/client';
import { DocumentEmbeddingPayload } from '../queues/documentEmbeddingQueue';
import {
  createDocumentIndexer,
  DocumentIndexerConfig,
  extractContent,
  detectContentType,
} from '../../services/aiSearch';
import { getStorageProvider } from '../../common/storage';
import type { Logger } from 'pino';

interface ProcessorContext {
  prisma: typeof basePrisma;
  logger: Logger;
}

/**
 * Get embedding configuration
 *
 * Uses local embeddings (Transformers.js with multilingual-e5-large) by default.
 * This provides:
 * - Zero external dependencies (runs in Node.js process)
 * - No API keys required
 * - Professional-grade multilingual support (EN, ES, PT, and 90+ more)
 * - Same code runs in all environments (local, staging, production)
 */
function getEmbeddingConfig(): DocumentIndexerConfig {
  return {
    embedding: {
      providerCode: 'local',
      dimensions: 1024, // multilingual-e5-large
    },
    vectorTableName: 'document_chunk',
  };
}

/**
 * Download file content from storage using the storage provider
 */
async function downloadFile(storagePath: string): Promise<Buffer> {
  const storage = getStorageProvider();
  const localPath = await storage.download(storagePath);

  if (!localPath) {
    throw new Error(`Failed to download file from storage: ${storagePath}`);
  }

  const fs = await import('fs/promises');
  return await fs.readFile(localPath);
}

/**
 * Process a document embedding job
 */
export async function processDocumentEmbedding(
  payload: DocumentEmbeddingPayload,
  context: ProcessorContext
): Promise<void> {
  const { prisma, logger } = context;
  const { documentId, tenantId, userId, filename, fileUrl, workerEventId } = payload;
  const startTime = Date.now();
  const now = new Date();

  logger.info({
    documentId,
    tenantId,
    filename,
    workerEventId,
    attempt: payload._retryAttempt || 1,
  }, 'Processing document embedding');

  // Update worker event to processing
  if (workerEventId) {
    try {
      await prisma.workerEvent.update({
        where: { id: workerEventId },
        data: {
          status: 'processing',
          startedAt: now,
          retryCount: payload._retryAttempt || 1,
        },
      });
    } catch (error) {
      logger.warn({ workerEventId, error }, 'Failed to update WorkerEvent to processing');
    }
  }

  // Update document status to processing
  try {
    await prisma.tenantDocument.update({
      where: { id: documentId },
      data: {
        status: 'processing',
      },
    });
  } catch (error) {
    logger.warn({ documentId, error }, 'Failed to update document status to processing');
  }

  try {
    // Get embedding configuration (uses local Transformers.js embeddings)
    const indexerConfig = getEmbeddingConfig();

    // Get document's configuration
    const document = await prisma.tenantDocument.findUnique({
      where: { id: documentId },
      select: {
        name: true,
        contentType: true,
        chunkingStrategy: true,
        chunkingSeparatorRegex: true,
        chunkingMaxTokens: true,
        chunkingOverlapTokens: true,
      },
    });

    // Download file content first (needed for content type detection)
    logger.debug({ documentId, fileUrl }, 'Downloading document');
    const fileBuffer = await downloadFile(fileUrl);

    // Detect content type if not set
    let contentType = document?.contentType;
    if (!contentType) {
      try {
        logger.debug({ documentId }, 'Detecting content type');
        const extracted = await extractContent(fileBuffer, filename, documentId);
        const detection = detectContentType(extracted.text);
        contentType = detection.contentType;

        logger.info({
          documentId,
          detectedType: contentType,
          confidence: detection.confidence,
          patterns: detection.matchedPatterns,
        }, 'Content type detected');

        // Update document with detected content type
        await prisma.tenantDocument.update({
          where: { id: documentId },
          data: { contentType },
        });
      } catch (error) {
        logger.warn({ documentId, error }, 'Failed to detect content type, using general');
        contentType = 'general';
      }
    }

    // Build processing options from document config
    const processingOptions = {
      strategy: document?.chunkingStrategy || 'auto',
      separatorRegex: document?.chunkingSeparatorRegex || undefined,
      maxTokensPerChunk: document?.chunkingMaxTokens || 500,
      overlapTokens: document?.chunkingOverlapTokens || 50,
      contentType,
      documentName: document?.name || filename,
    };

    logger.debug({
      documentId,
      chunkingStrategy: processingOptions.strategy,
      contentType: processingOptions.contentType,
      hasCustomRegex: !!processingOptions.separatorRegex,
    }, 'Using processing configuration');

    // Create document indexer with context for audit fields
    const indexer = createDocumentIndexer(prisma, indexerConfig, {
      tenantId,
      userId,
    });

    // Process and index document
    logger.debug({ documentId, filename, size: fileBuffer.length }, 'Indexing document');
    const result = await indexer.indexDocument(documentId, fileBuffer, filename, processingOptions);

    if (!result.success) {
      throw new Error(result.error || 'Unknown indexing error');
    }

    // Update document status to ready
    await prisma.tenantDocument.update({
      where: { id: documentId },
      data: {
        status: 'ready',
        chunkCount: result.chunkCount,
        processedAt: new Date(),
        processingError: null,
      },
    });

    const duration = Date.now() - startTime;

    // Update worker event to completed
    if (workerEventId) {
      try {
        await prisma.workerEvent.update({
          where: { id: workerEventId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            duration,
            result: {
              chunkCount: result.chunkCount,
              totalTokens: result.totalTokens,
            },
          },
        });
      } catch (error) {
        logger.warn({ workerEventId, error }, 'Failed to update WorkerEvent to completed');
      }
    }

    logger.info({
      documentId,
      tenantId,
      filename,
      chunkCount: result.chunkCount,
      totalTokens: result.totalTokens,
      duration,
    }, 'Document embedding completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error({
      documentId,
      tenantId,
      filename,
      error: errorMessage,
      duration,
    }, 'Failed to process document embedding');

    // Update document status to error
    try {
      await prisma.tenantDocument.update({
        where: { id: documentId },
        data: {
          status: 'error',
          processingError: errorMessage.slice(0, 500),
        },
      });
    } catch (updateError) {
      logger.error({ documentId, err: updateError }, 'Failed to update document status to error');
    }

    // Update worker event to failed
    if (workerEventId) {
      try {
        await prisma.workerEvent.update({
          where: { id: workerEventId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            duration,
            error: {
              message: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
            },
          },
        });
      } catch (updateError) {
        logger.warn({ workerEventId, err: updateError }, 'Failed to update WorkerEvent to failed');
      }
    }

    throw error;
  }
}
