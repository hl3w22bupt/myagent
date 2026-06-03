/**
 * MyAgent Knowledge Base Management
 *
 * @deprecated Use PostgresVectorStore adapter directly.
 * This file is kept for backward compatibility.
 */

import { PostgresVectorStore } from './adapters/postgres-adapter.js';
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

// Backward compatible wrapper
export class KnowledgeBase {
  private adapter: PostgresVectorStore;

  constructor(config: KnowledgeBaseConfig) {
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

    this.adapter = new PostgresVectorStore(postgresConfig);
  }

  async retrieve(collectionName: string, query: string, options?: any): Promise<any> {
    return this.adapter.retrieve(collectionName, query, options);
  }

  async close(): Promise<void> {
    return this.adapter.close();
  }
}
