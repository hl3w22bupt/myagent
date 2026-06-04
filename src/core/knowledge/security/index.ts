/**
 * Knowledge Base Security Module
 *
 * Exports all security-related functionality for knowledge base operations.
 *
 * Features:
 * - Collection name validation (prevents SQL injection)
 * - Tenant isolation (ACL)
 * - Rate limiting (prevents abuse)
 */

export {
  validateCollectionName,
  validateAppId,
  validateFieldName,
  validateCollectionNames,
  isReservedCollectionName,
  type ValidationResult,
} from './collection-validator.js';

export {
  checkCollectionAccess,
  getAccessibleCollections,
  checkBatchCollectionAccess,
  grantCollectionAccess,
  revokeCollectionAccess,
  closePool as closeTenantIsolationPool,
  type AccessControlEntry,
} from './tenant-isolation.js';

export {
  RateLimiter,
  getRateLimiter,
  checkRetrievalRateLimit,
  checkIngestionRateLimit,
  resetRateLimit,
  closeAllLimiters,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limiter.js';
