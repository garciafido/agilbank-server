/**
 * Storage Tracking Service
 *
 * Tracks document storage usage per tenant:
 * - Validates storage limits before upload
 * - Records upload/delete operations in history
 * - Updates tenant's current storage counter
 */

import { PrismaClient } from '../../../prisma/generated-client/client';

/**
 * Parameters for storage tracking operations
 */
export interface StorageTrackingParams {
  tenantId: string;
  documentId: string;
  documentName: string;
  fileType: string;
  fileSize: number;
  userId: string;
}

/**
 * Result of storage limit check
 */
export interface StorageLimitCheckResult {
  allowed: boolean;
  currentBytes: number;
  limitBytes: number | null;
  requestedBytes: number;
}

/**
 * Check if tenant has enough storage quota for upload
 *
 * @param prisma - Prisma client instance
 * @param tenantId - Tenant ID to check
 * @param additionalBytes - Bytes to be added
 * @returns Check result with current/limit info
 */
export async function checkStorageLimit(
  prisma: PrismaClient,
  tenantId: string,
  additionalBytes: number
): Promise<StorageLimitCheckResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      currentStorageBytes: true,
      storageByteLimit: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const newTotal = tenant.currentStorageBytes + additionalBytes;
  const allowed =
    tenant.storageByteLimit === null || newTotal <= tenant.storageByteLimit;

  return {
    allowed,
    currentBytes: tenant.currentStorageBytes,
    limitBytes: tenant.storageByteLimit,
    requestedBytes: additionalBytes,
  };
}

/**
 * Track document upload - increment storage counter and record in history
 *
 * @param prisma - Prisma client instance
 * @param params - Upload tracking parameters
 */
export async function trackStorageUpload(
  prisma: PrismaClient,
  params: StorageTrackingParams
): Promise<void> {
  const { tenantId, documentId, documentName, fileType, fileSize, userId } = params;

  // Increment tenant's storage counter
  const updatedTenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      currentStorageBytes: { increment: fileSize },
    },
    select: {
      currentStorageBytes: true,
    },
  });

  // Record in history
  await prisma.tenantStorageUsage.create({
    data: {
      tenant_: { connect: { id: tenantId } },
      operation: 'Upload',
      bytes: fileSize,
      documentName,
      documentId,
      fileType,
      timestamp: new Date(),
      balanceAfter: updatedTenant.currentStorageBytes,
      version_: '1',
      createdAt_: new Date(),
      createdBy_: { connect: { id: userId } },
    },
  });
}

/**
 * Track document deletion - decrement storage counter and record in history
 *
 * @param prisma - Prisma client instance
 * @param params - Delete tracking parameters
 */
export async function trackStorageDelete(
  prisma: PrismaClient,
  params: StorageTrackingParams
): Promise<void> {
  const { tenantId, documentId, documentName, fileType, fileSize, userId } = params;

  // Get current storage to prevent negative values
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      currentStorageBytes: true,
    },
  });

  // Calculate new value (never go below 0)
  const newBytes = Math.max(0, (tenant?.currentStorageBytes || 0) - fileSize);

  // Update tenant's storage counter
  const updatedTenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      currentStorageBytes: newBytes,
    },
    select: {
      currentStorageBytes: true,
    },
  });

  // Record in history (bytes is negative for delete)
  await prisma.tenantStorageUsage.create({
    data: {
      tenant_: { connect: { id: tenantId } },
      operation: 'Delete',
      bytes: -fileSize,
      documentName,
      documentId,
      fileType,
      timestamp: new Date(),
      balanceAfter: updatedTenant.currentStorageBytes,
      version_: '1',
      createdAt_: new Date(),
      createdBy_: { connect: { id: userId } },
    },
  });
}

/**
 * Get storage usage summary for a tenant
 *
 * @param prisma - Prisma client instance
 * @param tenantId - Tenant ID
 * @returns Storage usage summary
 */
export async function getStorageUsageSummary(
  prisma: PrismaClient,
  tenantId: string
): Promise<{
  currentBytes: number;
  limitBytes: number | null;
  usagePercentage: number | null;
  documentCount: number;
}> {
  const [tenant, documentCount] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        currentStorageBytes: true,
        storageByteLimit: true,
      },
    }),
    prisma.tenantDocument.count({
      where: { tenant_id_: tenantId },
    }),
  ]);

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  return {
    currentBytes: tenant.currentStorageBytes,
    limitBytes: tenant.storageByteLimit,
    usagePercentage:
      tenant.storageByteLimit !== null
        ? (tenant.currentStorageBytes / tenant.storageByteLimit) * 100
        : null,
    documentCount,
  };
}
