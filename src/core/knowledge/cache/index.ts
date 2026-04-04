/**
 * Knowledge Base Cache Module
 *
 * Exports caching and batch retrieval functionality for knowledge base.
 *
 * Features:
 * - LRU cache for retrieval results
 * - Batch retrieval optimization
 * - Cache statistics and management
 */

export {
  KnowledgeCache,
  getGlobalCache,
  resetGlobalCache,
  closeGlobalCache,
  type CacheKey,
  type CacheConfig,
} from './knowledge-cache';

export {
  BatchRetriever,
  getGlobalBatchRetriever,
  closeGlobalBatchRetriever,
  type BatchRetrievalRequest,
  type BatchRetrievalResult,
  type BatchRetrieverConfig,
} from './batch-retriever';
