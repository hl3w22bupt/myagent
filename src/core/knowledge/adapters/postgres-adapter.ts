/**
 * PostgreSQL + pgvector Adapter
 * Implements IVectorStore interface for PostgreSQL with pgvector extension
 */

import { Pool, PoolConfig } from 'pg';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import type {
  IVectorStore,
  KnowledgeEntry,
  RetrieveOptions,
  EmbeddingOptions,
} from '../interfaces/vector-store.interface.js';
import type { PostgresConfig } from '../interfaces/adapter-config.interface.js';
import {
  ValidationError,
  ConnectionError,
  KnowledgeInsertError,
  EmbeddingGenerationError,
} from '../errors/knowledge-errors.js';

export class PostgresVectorStore implements IVectorStore {
  private pool: Pool;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions: number;

  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private readonly MAX_CONTENT_LENGTH = 100000;

  constructor(config: PostgresConfig) {
    if (!config.embedding.apiKey) {
      throw new Error('API key is required for PostgresVectorStore');
    }

    this.pool = new Pool({
      host: config.connection.host,
      port: config.connection.port,
      database: config.connection.database,
      user: config.connection.user,
      password: config.connection.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.openai = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseURL,
    });

    this.embeddingModel = config.embedding.model;
    this.embeddingDimensions = config.embedding.dimensions;

    this.embeddingCache = new LRUCache<string, number[]>({
      max: 1000,
      ttl: config.cacheTtl || 300000,
    });
  }

  async addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<number> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    const sanitizedContent = this.sanitizeContent(content);
    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      throw new ValidationError('Content cannot be empty');
    }

    const embedding = await this.embedQueryWithRetry(sanitizedContent);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<{ id: number }>(
        `INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, collection_name, content)
         DO UPDATE SET
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()
         RETURNING id`,
        [tenantId, collectionName, sanitizedContent, JSON.stringify(metadata || {}), embedding]
      );

      await client.query('COMMIT');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new KnowledgeInsertError(`Failed to add knowledge: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }

  async addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<number[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    const ids: number[] = [];
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        const sanitizedContent = this.sanitizeContent(entry.content);
        const embedding = await this.embedQueryWithRetry(sanitizedContent);

        const result = await client.query<{ id: number }>(
          `INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, collection_name, content)
           DO UPDATE SET metadata = EXCLUDED.metadata
           RETURNING id`,
          [tenantId, collectionName, sanitizedContent, JSON.stringify(entry.metadata || {}), embedding]
        );

        ids.push(result.rows[0].id);
      }

      await client.query('COMMIT');
      return ids;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new KnowledgeInsertError(`Failed to add batch knowledge: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }

  async retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options: RetrieveOptions = {}
  ): Promise<KnowledgeEntry[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }

    const limit = options.limit || 5;
    const threshold = options.threshold || 0.7;

    const queryEmbedding = await this.embedQueryWithRetry(query);

    const client = await this.pool.connect();
    try {
      const searchQuery = `
        SELECT id, tenant_id, collection_name, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity,
               created_at, updated_at
        FROM knowledge
        WHERE tenant_id = $2 AND collection_name = $3
          AND 1 - (embedding <=> $1::vector) > $4
        ORDER BY embedding <=> $1::vector
        LIMIT $5
      `;

      const result = await client.query<KnowledgeEntry>(
        searchQuery,
        [`[${queryEmbedding.join(',')}]`, tenantId, collectionName, threshold, limit]
      );

      return result.rows;
    } catch (err) {
      console.error(`PostgreSQL retrieval error for collection ${collectionName}:`, err);
      return [];
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  async close(): Promise<void> {
    this.embeddingCache.clear();
    await this.pool.end();
  }

  private async embedQueryWithRetry(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;

    const cached = this.embeddingCache.get(text);
    if (cached) return cached;

    let lastError: Error;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: text,
        });

        const embedding = response.data[0].embedding;
        this.embeddingCache.set(text, embedding);
        return embedding;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
        }
      }
    }

    throw new EmbeddingGenerationError(
      `Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`,
      { cause: lastError }
    );
  }

  private sanitizeContent(content: string): string {
    if (content.length > this.MAX_CONTENT_LENGTH) {
      content = content.substring(0, this.MAX_CONTENT_LENGTH);
    }

    content = content.replace(/<[^>]*>/g, '');
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    content = content.replace(/;.*DROP TABLE.*/gi, '');
    content = content.replace(/;.*DELETE FROM.*/gi, '');
    content = content.replace(/;.*EXEC.*/gi, '');
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }
}
