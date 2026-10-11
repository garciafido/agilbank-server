/**
 * Storage Tracking Module
 *
 * Provides storage usage tracking for tenant documents
 */

export {
  checkStorageLimit,
  trackStorageUpload,
  trackStorageDelete,
  getStorageUsageSummary,
  StorageTrackingParams,
  StorageLimitCheckResult,
} from './storageTrackingService';
