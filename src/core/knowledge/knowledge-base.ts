/**
 * MyAgent Knowledge Base Management
 *
 * @deprecated Use PostgresVectorStore adapter directly.
 * This file is kept for backward compatibility.
 */

import type { PostgresConfig } from './interfaces/adapter-config.interface.js';

// Re-export for backward compatibility
export type { KnowledgeEntry, RetrieveOptions } from './interfaces/knowledge-entry.interface.js';

export interface KnowledgeBaseConfig {
  db: any;
  openaiApiKey?: string;
  apiKey?: string;
  baseURL?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  cacheTtl?: number;
}

// Backward compatible wrapper using dynamic import
export class KnowledgeBase {
  private adapter: any;

  constructor(config: KnowledgeBaseConfig) {
    // Store config for later use
    const postgresConfig: PostgresConfig = {
      type: 'postgres-pgvector',
      embedding: {
        apiKey: config.openaiApiKey || config.apiKey || '',
        baseURL: config.baseURL,
        model: config.embeddingModel || 'text-embedding-3-small',
        dimensions: config.embeddingDimensions || 1536,
      },
      cacheTtl: config.cacheTtl,
      connection: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
      },
    };

    // Store config for lazy loading
    this.config = postgresConfig;
  }

  private config: PostgresConfig;
  private _adapter: any = null;

  private async getAdapter() {
    if (!this._adapter) {
      const { PostgresVectorStore } = await import('./adapters/postgres-adapter.js');
      this._adapter = new PostgresVectorStore(this.config);
    }
    return this._adapter;
  }

  async addKnowledge(tenantId: string, collectionName: string, content: string, metadata?: Record<string, any>): Promise<number> {
    const adapter = await this.getAdapter();
    return adapter.addKnowledge(tenantId, collectionName, content, metadata);
  }

  async retrieve(tenantId: string, collectionName: string, query: string, options?: any): Promise<any> {
    const adapter = await this.getAdapter();
    return adapter.retrieve(tenantId, collectionName, query, options);
  }

  async close(): Promise<void> {
    if (this._adapter) {
      return this._adapter.close();
    }
  }
}
