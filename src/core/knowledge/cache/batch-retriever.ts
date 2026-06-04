/**
 * Batch Knowledge Retriever
 *
 * Optimizes multiple knowledge retrievals by batching queries
 * and reducing database round trips.
 */

import type { KnowledgeEntry } from '../interfaces/knowledge-entry.interface.js';
import type { RetrieveOptions } from '../interfaces/knowledge-entry.interface.js';
import { getGlobalCache } from './knowledge-cache.js';
import type { KnowledgeCache } from './knowledge-cache.js';

/**
 * Batch retrieval request
 */
export interface BatchRetrievalRequest {
  collectionName: string;
  query: string;
  options?: RetrieveOptions;
}

/**
 * Batch retrieval result
 */
export interface BatchRetrievalResult {
  query: string;
  results: KnowledgeEntry[];
  error?: string;
  cached: boolean;
}

/**
 * Batch retriever configuration
 */
export interface BatchRetrieverConfig {
  maxBatchSize: number;
  useCache: boolean;
  cacheTtl?: number;
}

/**
 * Batch Knowledge Retriever
 *
 * Optimizes multiple retrievals by:
 * 1. Batching queries to reduce database round trips
 * 2. Using LRU cache to avoid redundant queries
 * 3. Parallelizing independent retrievals
 */
export class BatchRetriever {
  private config: BatchRetrieverConfig;
  private cache: KnowledgeCache;

  constructor(config: Partial<BatchRetrieverConfig> = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize || 10,
      useCache: config.useCache !== false,
    };

    this.cache = getGlobalCache({
      ttl: config.cacheTtl || 5 * 60 * 1000,
    });
  }

  /**
   * Retrieve knowledge for multiple queries in batch
   *
   * @param requests - Array of retrieval requests
   * @param retrieveFn - Function to perform actual retrieval
   * @returns Array of retrieval results
   */
  async batchRetrieve(
    requests: BatchRetrievalRequest[],
    retrieveFn: (collectionName: string, query: string, options?: RetrieveOptions) => Promise<KnowledgeEntry[]>
  ): Promise<BatchRetrievalResult[]> {
    const results: BatchRetrievalResult[] = [];

    // Process requests in batches
    for (let i = 0; i < requests.length; i += this.config.maxBatchSize) {
      const batch = requests.slice(i, i + this.config.maxBatchSize);
      const batchResults = await this.processBatch(batch, retrieveFn);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Process a batch of retrieval requests
   */
  private async processBatch(
    batch: BatchRetrievalRequest[],
    retrieveFn: (collectionName: string, query: string, options?: RetrieveOptions) => Promise<KnowledgeEntry[]>
  ): Promise<BatchRetrievalResult[]> {
    const results: BatchRetrievalResult[] = [];

    // Check cache first (if enabled)
    const cacheMisses: BatchRetrievalRequest[] = [];

    if (this.config.useCache) {
      for (const request of batch) {
        const cached = this.cache.get({
          collectionName: request.collectionName,
          query: request.query,
          limit: request.options?.limit,
          threshold: request.options?.threshold,
        });

        if (cached) {
          results.push({
            query: request.query,
            results: cached,
            cached: true,
          });
        } else {
          cacheMisses.push(request);
        }
      }
    } else {
      cacheMisses.push(...batch);
    }

    // Parallel retrieve cache misses
    if (cacheMisses.length > 0) {
      const retrievalPromises = cacheMisses.map(async (request) => {
        try {
          const retrievedResults = await retrieveFn(
            request.collectionName,
            request.query,
            request.options
          );

          // Cache the results
          if (this.config.useCache) {
            this.cache.set(
              {
                collectionName: request.collectionName,
                query: request.query,
                limit: request.options?.limit,
                threshold: request.options?.threshold,
              },
              retrievedResults
            );
          }

          return {
            query: request.query,
            results: retrievedResults,
            cached: false,
          };
        } catch (error: any) {
          return {
            query: request.query,
            results: [],
            error: error.message,
            cached: false,
          };
        }
      });

      const retrievedResults = await Promise.all(retrievalPromises);
      results.push(...retrievedResults);
    }

    return results;
  }

  /**
   * Retrieve multiple queries for the same collection
   *
   * Optimized for same-collection retrievals
   *
   * @param collectionName - Collection name
   * @param queries - Array of queries
   * @param options - Retrieval options
   * @param retrieveFn - Function to perform actual retrieval
   * @returns Array of retrieval results
   */
  async retrieveMultiple(
    collectionName: string,
    queries: string[],
    options: RetrieveOptions,
    retrieveFn: (collectionName: string, query: string, options?: RetrieveOptions) => Promise<KnowledgeEntry[]>
  ): Promise<Map<string, KnowledgeEntry[]>> {
    const resultMap = new Map<string, KnowledgeEntry[]>();

    // Check cache
    const cacheMisses: string[] = [];

    if (this.config.useCache) {
      for (const query of queries) {
        const cached = this.cache.get({
          collectionName,
          query,
          limit: options.limit,
          threshold: options.threshold,
        });

        if (cached) {
          resultMap.set(query, cached);
        } else {
          cacheMisses.push(query);
        }
      }
    } else {
      cacheMisses.push(...queries);
    }

    // Parallel retrieve cache misses
    if (cacheMisses.length > 0) {
      const retrievalPromises = cacheMisses.map(async (query) => {
        try {
          const results = await retrieveFn(collectionName, query, options);

          // Cache results
          if (this.config.useCache) {
            this.cache.set(
              {
                collectionName,
                query,
                limit: options.limit,
                threshold: options.threshold,
              },
              results
            );
          }

          return { query, results };
        } catch (error) {
          console.error(`[BatchRetriever] Failed to retrieve for query: ${query}`, error);
          return { query, results: [] };
        }
      });

      const retrievedResults = await Promise.all(retrievalPromises);

      for (const { query, results } of retrievedResults) {
        resultMap.set(query, results);
      }
    }

    return resultMap;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache for a specific collection
   */
  invalidateCollection(collectionName: string): void {
    this.cache.invalidateCollection(collectionName);
  }
}

/**
 * Global batch retriever instance
 */
let globalBatchRetriever: BatchRetriever | null = null;

/**
 * Get global batch retriever instance
 *
 * @param config - Optional configuration
 * @returns Global batch retriever instance
 */
export function getGlobalBatchRetriever(config?: Partial<BatchRetrieverConfig>): BatchRetriever {
  if (!globalBatchRetriever) {
    globalBatchRetriever = new BatchRetriever(config);
  }
  return globalBatchRetriever;
}

/**
 * Close global batch retriever
 */
export function closeGlobalBatchRetriever(): void {
  globalBatchRetriever = null;
}
