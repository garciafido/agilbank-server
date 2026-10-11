import { removeFile } from "../../common/utils/moveUploadedFiles";
import { FileDeletionPayload } from "../queues/fileDeletionQueue";
import type { Logger } from "pino";
import { basePrisma } from "../../prisma/client";
import { randomUUID } from "crypto";

interface ProcessorContext {
  prisma: typeof basePrisma;
  logger: Logger;
}

/**
 * Process file deletion jobs from the queue
 * This runs asynchronously after a successful entity deletion or update
 */
export async function processFileDeletion(
  payload: FileDeletionPayload,
  context: ProcessorContext
): Promise<void> {
  const { logger, prisma } = context;
  const { entityType, entityId, files, tenantId, workerEventId } = payload;
  const startTime = Date.now();

  logger.info(
    {
      entityType,
      entityId,
      fileCount: files.length,
      tenantId,
      workerEventId
    },
    "Processing file deletion job"
  );

  // Update WorkerEvent status to processing
  if (workerEventId) {
    await prisma.workerEvent.update({
      where: { id: workerEventId },
      data: {
        version_: randomUUID(),
        status: 'processing',
        startedAt: new Date()
      }
    });
  }

  let deletedCount = 0;
  let failedCount = 0;
  const errors: Array<{ fieldName: string; error: string }> = [];

  // Process each file deletion
  for (const file of files) {
    try {
      await removeFile(file.serverData, entityId);
      deletedCount++;

      logger.debug(
        {
          entityType,
          entityId,
          fieldName: file.fieldName,
          baseName: file.serverData.baseName,
          filename: file.serverData.filename
        },
        "File deleted successfully"
      );
    } catch (error) {
      failedCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);

      errors.push({
        fieldName: file.fieldName,
        error: errorMessage
      });

      // Log warning but continue processing other files
      logger.warn(
        {
          entityType,
          entityId,
          fieldName: file.fieldName,
          serverData: file.serverData,
          error: errorMessage
        },
        "Failed to delete file - may already be deleted or not exist"
      );
    }
  }

  const duration = Date.now() - startTime;

  // Update WorkerEvent with final status
  if (workerEventId) {
    const finalStatus = failedCount > 0 ? 'completed_with_warnings' : 'completed';
    await prisma.workerEvent.update({
      where: { id: workerEventId },
      data: {
        version_: randomUUID(),
        status: finalStatus,
        completedAt: new Date(),
        duration,
        result: {
          deletedCount,
          failedCount,
          totalFiles: files.length,
          ...(errors.length > 0 ? { errors } : {})
        }
      }
    });
  }

  // Log final summary
  if (failedCount > 0) {
    logger.warn(
      {
        entityType,
        entityId,
        deletedCount,
        failedCount,
        totalFiles: files.length,
        errors,
        duration,
        workerEventId
      },
      "File deletion completed with some failures"
    );
  } else {
    logger.info(
      {
        entityType,
        entityId,
        deletedCount,
        totalFiles: files.length,
        duration,
        workerEventId
      },
      "File deletion completed successfully"
    );
  }

  // Note: We don't throw errors here because:
  // 1. The entity is already deleted from the database
  // 2. Some files might already be manually deleted
  // 3. We want to attempt deletion of all files, not stop at first error
  // 4. Failed deletions are logged for manual cleanup if needed
}
