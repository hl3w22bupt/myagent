/**
 * PostgreSQL + pgvector Adapter
 * Implements IVectorStore interface for PostgreSQL with pgvector extension
 */

import { Pool } from 'pg';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import type {
  IVectorStore,
  KnowledgeEntry,
  RetrieveOptions,
  EmbeddingOptions,
} from '../interfaces/vector-store.interface';
import type { PostgresConfig } from '../interfaces/adapter-config.interface';
import {
  ValidationError,
  EmbeddingGenerationError,
} from '../errors/knowledge-errors';

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

  async retrieve(
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
        SELECT id, collection_name, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity,
               created_at, updated_at
        FROM knowledge
        WHERE collection_name = $2
          AND 1 - (embedding <=> $1::vector) > $3
        ORDER BY embedding <=> $1::vector
        LIMIT $4
      `;

      const result = await client.query<KnowledgeEntry>(
        searchQuery,
        [`[${queryEmbedding.join(',')}]`, collectionName, threshold, limit]
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

    let lastError: Error | undefined;
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
      `Failed to generate embedding after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  private sanitizeContent(content: string): string {
    if (content.length > this.MAX_CONTENT_LENGTH) {
      content = content.substring(0, this.MAX_CONTENT_LENGTH);
    }

    content = content.replace(/<[^>]*>/g, '');
    // Remove control characters (excluding tab, newline, carriage return)
    // eslint-disable-next-line no-control-regex
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    content = content.replace(/;.*DROP TABLE.*/gi, '');
    content = content.replace(/;.*DELETE FROM.*/gi, '');
    content = content.replace(/;.*EXEC.*/gi, '');
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }
}
