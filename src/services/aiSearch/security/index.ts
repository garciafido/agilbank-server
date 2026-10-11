/**
 * AI Search Security Module
 *
 * Provides permission-based schema filtering and response validation
 * to ensure no unauthorized data is exposed through AI Search.
 */

// Types
export * from './types';

// Schema filtering
export {
  filterSchema,
  buildSecurityContext,
  getVisibleEntityLabels,
  getAllEntityNames,
  getPermissionFingerprint,
} from './schemaFilter';

// Response validation
export {
  validateResponse,
  validateSources,
  createSecurityAuditEntry,
} from './responseValidator';
