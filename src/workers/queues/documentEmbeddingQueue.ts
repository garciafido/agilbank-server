/**
 * Document Embedding Queue
 *
 * Queue for processing document embeddings asynchronously.
 * Triggered when documents are uploaded to TenantDocument.
 */

import { randomUUID } from 'crypto';
import { pgmq } from '../../utils/pgmq';
import { logger } from '../../utils/logger';
import { basePrisma } from '../../prisma/client';

export interface DocumentEmbeddingPayload {
  type: 'embed_document';
  documentId: string;
  tenantId: string;
  userId: string;
  filename: string;
  fileUrl: string;
  workerEventId?: string;
  _retryAttempt?: number;
}

const QUEUE_NAME = 'document_embeddings';

/**
 * Enqueue a document for embedding processing
 */
export async function enqueueDocumentEmbedding(params: {
  documentId: string;
  tenantId: string;
  userId: string;
  filename: string;
  fileUrl: string;
}): Promise<string> {
  const { documentId, tenantId, userId, filename, fileUrl } = params;

  try {
    // Create worker event for tracking
    const workerEvent = await basePrisma.workerEvent.create({
      data: {
        queueName: QUEUE_NAME,
        jobType: 'embed_document',
        status: 'queued',
        enqueuedAt: new Date(),
        payload: { documentId, filename },
        retryCount: 0,
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: userId } },
        triggerUserId: { connect: { id: userId } },
        tenant_: { connect: { id: tenantId } },
      },
    });

    const payload: DocumentEmbeddingPayload = {
      type: 'embed_document',
      documentId,
      tenantId,
      userId,
      filename,
      fileUrl,
      workerEventId: workerEvent.id,
      _retryAttempt: 1,
    };

    await pgmq.send(QUEUE_NAME, payload);

    logger.info({
      documentId,
      tenantId,
      filename,
      workerEventId: workerEvent.id,
    }, 'Document embedding enqueued');

    return workerEvent.id;
  } catch (error) {
    logger.error({
      documentId,
      tenantId,
      filename,
      error,
    }, 'Failed to enqueue document embedding');
    throw error;
  }
}

/**
 * Re-enqueue a document for re-processing (e.g., after config change)
 */
export async function enqueueDocumentReembedding(params: {
  documentId: string;
  tenantId: string;
  userId: string;
  filename: string;
  fileUrl: string;
}): Promise<string> {
  // Same as enqueue but marks the document status as pending first
  const { documentId } = params;

  // Reset document status to pending and clear previous processing data
  await basePrisma.tenantDocument.update({
    where: { id: documentId },
    data: {
      status: 'pending',
      chunkCount: null,
      processedAt: null,
      processingError: null,
    },
  });

  // Delete existing chunks for this document
  await basePrisma.documentChunk.deleteMany({
    where: { document: { id: documentId } },
  });

  return enqueueDocumentEmbedding(params);
}

export { QUEUE_NAME as DOCUMENT_EMBEDDING_QUEUE };
