/**
 * E-Signature Completion Handler (Generic)
 *
 * On DOCUMENT_COMPLETED: downloads signed PDF + audit log,
 * creates a ZIP archive, and stores the result in esignatureDocument.metadata.
 *
 * On DOCUMENT_BLOCKCHAIN_CONFIRMED: downloads blockchain cert
 * and adds it to the existing ZIP archive.
 *
 * This handler is project-agnostic. Project-specific logic (e.g.,
 * replacing files in domain entities, workflow transitions, SSE events)
 * should be registered separately via additional handler.on() callbacks.
 */

import { PrismaClient } from '../../prisma/generated-client/client';
import { logger } from '../../utils/logger';
import { ESignatureEvent, ESignatureEventType } from './types';
import { resolveESignatureConfig, createESignatureProvider } from './providers';
import { zipDocuments, addToZip } from './utils/zipDocumentsUtil';
import { ESignatureEventHandler } from './EsignatureEventHandler';

/**
 * When true, the provider returns a single PDF bundle that already includes
 * signed document + audit trail (+ blockchain cert when available).
 * The legacy ZIP path is kept but bypassed.
 */
const USE_PROVIDER_BUNDLE = true;

/**
 * Merge atómico de keys en esignatureDocument.metadata (jsonb ||): tres
 * escritores concurren sobre el mismo campo (completion, blockchain-confirmed
 * y el stamp del freeze) — un read-modify-write pisaría keys ajenas (perder el
 * stamp de signedEditionId deja la SignedEdition fuera de la reconciliación).
 * Exportado para que el proyecto lo reuse en sus propios writers.
 */
export async function mergeDocumentMetadata(
  prisma: PrismaClient,
  externalId: string,
  tenantId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE esignature_document
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
    WHERE external_id = ${externalId} AND tenant__id__ = ${tenantId}
  `;
}

export function registerCompletionHandler(
  handler: ESignatureEventHandler,
  prisma: PrismaClient
): void {
  handler.on(ESignatureEventType.DOCUMENT_COMPLETED, async (event, tenantId) => {
    try {
      await handleDocumentCompletion(prisma, event, tenantId);
    } catch (error) {
      logger.error(
        { error, documentId: event.documentId, tenantId },
        'Failed to process document completion (download + archive)'
      );
    }
  });

  handler.on(ESignatureEventType.DOCUMENT_BLOCKCHAIN_CONFIRMED, async (event, tenantId) => {
    try {
      await handleBlockchainConfirmed(prisma, event, tenantId);
    } catch (error) {
      logger.error(
        { error, documentId: event.documentId, tenantId },
        'Failed to process blockchain confirmation (download + add cert to archive)'
      );
    }
  });

  // Fallback: when each recipient signs, check if all recipients
  // of the document have signed. If so, promote document to 'completed'.
  // This covers providers that don't emit a document-level completion event.
  handler.on(ESignatureEventType.RECIPIENT_SIGNED, async (event, tenantId) => {
    try {
      await promoteToCompletedIfAllSigned(prisma, event.documentId, tenantId);
    } catch (error) {
      logger.error(
        { error, documentId: event.documentId, tenantId },
        'Failed to check all-signed promotion after recipient signed'
      );
    }
  });
}

export async function promoteToCompletedIfAllSigned(
  prisma: PrismaClient,
  externalDocumentId: string,
  tenantId: string
): Promise<boolean> {
  const doc = await prisma.esignatureDocument.findFirst({
    where: { externalId: externalDocumentId, tenant_id_: tenantId },
    select: { id: true, status: true },
  });
  if (!doc || doc.status === 'completed') return false;

  const recipients = await prisma.esignatureRecipient.findMany({
    where: { document_id: doc.id, tenant_id_: tenantId },
    select: { status: true },
  });

  if (recipients.length === 0) return false;
  if (!recipients.every(r => r.status === 'signed')) return false;

  await prisma.esignatureDocument.update({
    where: { id: doc.id },
    data: {
      status: 'completed' as any,
      completedAt: new Date(),
    },
  });

  logger.info(
    { documentId: externalDocumentId, tenantId },
    'All recipients signed — promoted document to completed (form.completed fallback)'
  );
  return true;
}

async function handleDocumentCompletion(
  prisma: PrismaClient,
  event: ESignatureEvent,
  tenantId: string
): Promise<void> {
  const config = await resolveESignatureConfig(prisma);
  if (!config) return;

  const provider = createESignatureProvider(config);

  // 1. Download signed PDF (bundle or single depending on flag)
  const downloadResult = await provider.downloadDocument(event.documentId);

  let archiveBuffer: Buffer;
  let archiveFormat: string;
  let mergedWithAuditLog = false;

  if (USE_PROVIDER_BUNDLE) {
    // Bundle path: provider returns a single PDF with everything included
    archiveBuffer = downloadResult.buffer;
    archiveFormat = 'pdf';
  } else {
    // Legacy ZIP path: build ZIP with signed doc + optional audit log
    const entries: { name: string; buffer: Buffer }[] = [
      { name: 'signed-document.pdf', buffer: downloadResult.buffer },
    ];

    if (!downloadResult.includesAuditTrail && typeof provider.downloadAuditLog === 'function') {
      const auditLog = await provider.downloadAuditLog(event.documentId);
      if (auditLog) {
        entries.push({ name: 'audit-log.pdf', buffer: auditLog });
        mergedWithAuditLog = true;
      }
    }

    archiveBuffer = await zipDocuments(entries);
    archiveFormat = 'zip';
  }

  // 2. Store — merge ATÓMICO (jsonb ||): preserva las keys existentes
  // (sourceEntity info, stamps del freeze) sin la ventana de lost-update del
  // read-modify-write cuando otros writers tocan metadata concurrentemente.
  await mergeDocumentMetadata(prisma, event.documentId, tenantId, {
    signedArchiveBase64: archiveBuffer.toString('base64'),
    signedArchiveSize: archiveBuffer.length,
    signedArchiveFormat: archiveFormat,
    mergedWithAuditLog,
    includesAuditTrail: USE_PROVIDER_BUNDLE || downloadResult.includesAuditTrail,
  });

  logger.info(
    {
      documentId: event.documentId,
      tenantId,
      archiveSize: archiveBuffer.length,
      archiveFormat,
      mergedWithAuditLog,
    },
    `Signed document downloaded and stored (${archiveFormat})`
  );
}

async function handleBlockchainConfirmed(
  prisma: PrismaClient,
  event: ESignatureEvent,
  tenantId: string
): Promise<void> {
  const config = await resolveESignatureConfig(prisma);
  if (!config) return;
  const provider = createESignatureProvider(config);

  const existingDoc = await prisma.esignatureDocument.findFirst({
    where: { externalId: event.documentId, tenant_id_: tenantId },
    select: { metadata: true },
    orderBy: { createdAt_: 'desc' },
  });
  const existingMetadata = (existingDoc?.metadata as Record<string, unknown>) || {};

  let updatedArchive: Buffer;
  let archiveFormat: string;

  if (USE_PROVIDER_BUNDLE) {
    // Re-download bundle PDF (now includes blockchain certificate)
    const downloadResult = await provider.downloadDocument(event.documentId);
    updatedArchive = downloadResult.buffer;
    archiveFormat = 'pdf';
  } else {
    // Legacy ZIP path: download blockchain cert and add to existing ZIP
    if (typeof provider.downloadBlockchainCert !== 'function') {
      logger.debug({ provider: config.providerCode }, 'Provider does not support blockchain certs');
      return;
    }
    const blockchainCert = await provider.downloadBlockchainCert(event.documentId);
    if (!blockchainCert) {
      logger.warn({ documentId: event.documentId }, 'Blockchain cert not available');
      return;
    }

    const archiveBase64 = existingMetadata.signedArchiveBase64 as string | undefined;
    if (!archiveBase64) {
      logger.warn(
        { documentId: event.documentId },
        'No signed archive in metadata — blockchain cert arrived before document completion?'
      );
      return;
    }

    const existingArchive = Buffer.from(archiveBase64, 'base64');
    updatedArchive = await addToZip(existingArchive, [
      { name: 'blockchain-certificate.pdf', buffer: blockchainCert },
    ]);
    archiveFormat = 'zip';
  }

  await mergeDocumentMetadata(prisma, event.documentId, tenantId, {
    signedArchiveBase64: updatedArchive.toString('base64'),
    signedArchiveSize: updatedArchive.length,
    signedArchiveFormat: archiveFormat,
    blockchainCertIncluded: true,
  });

  logger.info(
    { documentId: event.documentId, archiveSize: updatedArchive.length, archiveFormat },
    'Blockchain certificate included in signed archive'
  );
}
