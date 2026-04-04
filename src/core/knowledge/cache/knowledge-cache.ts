/**
 * Knowledge Base Cache
 *
 * LRU cache for knowledge retrieval results to improve performance
 * and reduce database load.
 */

import { LRUCache } from 'lru-cache';
import type { KnowledgeEntry } from '../interfaces/knowledge-entry.interface';

/**
 * Cache key structure
 */
export interface CacheKey {
  collectionName: string;
  query: string;
  limit?: number;
  threshold?: number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  results: KnowledgeEntry[];
  timestamp: number;
  hitCount: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxItems: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * Knowledge Base Cache using LRU strategy
 */
export class KnowledgeCache {
  private cache: LRUCache<string, CacheEntry>;
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxItems: config.maxItems || 100, // Max 100 cached queries
      ttl: config.ttl || 5 * 60 * 1000, // 5 minutes default TTL
    };

    this.cache = new LRUCache<string, CacheEntry>({
      max: this.config.maxItems,
      ttl: this.config.ttl,
      updateAgeOnGet: true, // Refresh TTL on cache hit
      dispose: (value, key) => {
        this.stats.evictions++;
      },
    });
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(params: CacheKey): string {
    const { collectionName, query, limit, threshold } = params;
    return JSON.stringify({ collectionName, query, limit, threshold });
  }

  /**
   * Get cached results
   *
   * @param params - Cache key parameters
   * @returns Cached results or null if not found/expired
   */
  get(params: CacheKey): KnowledgeEntry[] | null {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    entry.hitCount++;
    return entry.results;
  }

  /**
   * Set cache entry
   *
   * @param params - Cache key parameters
   * @param results - Results to cache
   */
  set(params: CacheKey, results: KnowledgeEntry[]): void {
    const key = this.generateKey(params);

    const entry: CacheEntry = {
      results,
      timestamp: Date.now(),
      hitCount: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if cache has entry (without fetching)
   *
   * @param params - Cache key parameters
   * @returns True if entry exists
   */
  has(params: CacheKey): boolean {
    const key = this.generateKey(params);
    return this.cache.has(key);
  }

  /**
   * Invalidate specific cache entry
   *
   * @param params - Cache key parameters
   */
  invalidate(params: CacheKey): void {
    const key = this.generateKey(params);
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries for a specific collection
   *
   * @param collectionName - Collection name to invalidate
   */
  invalidateCollection(collectionName: string): void {
    // Scan through cache and delete matching entries
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      try {
        const params = JSON.parse(key) as CacheKey;
        if (params.collectionName === collectionName) {
          keysToDelete.push(key);
        }
      } catch (e) {
        // Invalid key, skip
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;

    return {
      ...this.stats,
      hitRate,
      size: this.cache.size,
      maxSize: this.config.maxItems,
      ttl: this.config.ttl,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clean up cache (remove expired entries)
   */
  cleanup(): void {
    // LRU cache handles this automatically, but we can force cleanup
    this.cache.purgeStale();
  }
}

/**
 * Global cache instance
 */
let globalCache: KnowledgeCache | null = null;

/**
 * Get global cache instance
 *
 * @param config - Optional cache configuration
 * @returns Global cache instance
 */
export function getGlobalCache(config?: Partial<CacheConfig>): KnowledgeCache {
  if (!globalCache) {
    globalCache = new KnowledgeCache(config);
  }
  return globalCache;
}

/**
 * Reset global cache
 */
export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.clear();
    globalCache.resetStats();
  }
}

/**
 * Close global cache
 */
export function closeGlobalCache(): void {
  globalCache = null;
}
