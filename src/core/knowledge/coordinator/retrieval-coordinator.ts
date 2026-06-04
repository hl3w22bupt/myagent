/**
 * Retrieval Coordinator
 * Coordinates parallel retrieval from multiple vector stores
 */

import type { IVectorStore, KnowledgeEntry, RetrieveOptions } from '../interfaces/vector-store.interface.js';
import type { VectorStoreConfig } from '../interfaces/adapter-config.interface.js';
import type { CoordinatorConfig } from './coordinator-config.interface.js';
import { PostgresVectorStore } from '../adapters/postgres-adapter.js';
import { validateConfig } from '../interfaces/adapter-config.interface.js';

export class RetrievalCoordinator {
  private stores: Map<string, IVectorStore> = new Map();
  private config: Required<CoordinatorConfig>;

  constructor(config: CoordinatorConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency || 5,
      limitPerSource: config.limitPerSource || 10,
      globalLimit: config.globalLimit || 5,
      normalizationStrategy: config.normalizationStrategy || 'min-max',
    };
  }

  /**
   * Get or create vector store instance for a config
   */
  private async getStore(config: VectorStoreConfig): Promise<IVectorStore> {
    const key = this.getStoreKey(config);

    if (!this.stores.has(key)) {
      validateConfig(config);

      if (config.type === 'postgres-pgvector') {
        this.stores.set(key, new PostgresVectorStore(config));
      } else if (config.type === 'lancedb') {
        // Use runtime loader to avoid bundling LanceDB native modules
        const { getLanceDBAdapter } = await import('../loaders/lancedb-loader');
        const LanceDBVectorStore = await getLanceDBAdapter();
        this.stores.set(key, new LanceDBVectorStore(config));
      }
    }

    return this.stores.get(key)!;
  }

  /**
   * Generate unique key for store caching
   */
  private getStoreKey(config: VectorStoreConfig): string {
    if (config.type === 'postgres-pgvector') {
      return `${config.type}://${config.connection.host}:${config.connection.port}/${config.connection.database}`;
    } else {
      return `${config.type}://${config.connection.uri}`;
    }
  }

  /**
   * Retrieve from multiple sources in parallel
   */
  async retrieve(
    sources: VectorStoreConfig[],
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]> {
    const QUERY_TIMEOUT = 10000;

    // Get all stores first (they may need dynamic imports)
    const storePromises = sources.map(source => this.getStore(source));
    const stores = await Promise.all(storePromises);

    const results = await Promise.allSettled(
      stores.map((store, _index) => {
        const queryPromise = store.retrieve(
          collectionName,
          query,
          { ...options, limit: this.config.limitPerSource }
        );

        const timeoutPromise = new Promise<KnowledgeEntry[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT)
        );

        return Promise.race([queryPromise, timeoutPromise]);
      })
    );

    const successfulResults = results
      .filter((r): r is PromiseFulfilledResult<KnowledgeEntry[]> =>
        r.status === 'fulfilled')
      .map(r => r.value)
      .flat();

    if (successfulResults.length === 0) {
      console.warn('All data sources failed for retrieval');
      return [];
    }

    const normalized = this.normalizeScores(successfulResults);
    return normalized
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, options?.limit || this.config.globalLimit);
  }

  /**
   * Normalize similarity scores across different sources
   */
  private normalizeScores(results: KnowledgeEntry[]): KnowledgeEntry[] {
    if (results.length === 0) return results;

    if (this.config.normalizationStrategy === 'none') {
      return results;
    }

    const scores = results.map(r => r.similarity || 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    if (max === min) {
      return results;
    }

    return results.map(r => ({
      ...r,
      similarity: ((r.similarity || 0) - min) / (max - min),
    }));
  }

  /**
   * Close all store connections
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.stores.values()).map(store => store.close());
    await Promise.all(closePromises);
    this.stores.clear();
  }
}
