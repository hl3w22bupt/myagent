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
  private dimensionCache: LRUCache<string, number>;

  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private readonly MAX_CONTENT_LENGTH = 100000;

  // ⭐ 维度到模型的映射（支持不同维度的知识表）
  private readonly DIMENSION_MODEL_MAP: Record<number, { model: string; baseURL?: string }> = {
    768: { model: 'nomic-embed-text', baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' },  // ollama
    1536: { model: 'text-embedding-3-small' },  // OpenAI
  };

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

    this.dimensionCache = new LRUCache<string, number>({
      max: 100,
      ttl: 3600000, // Cache dimensions for 1 hour
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
    const contentField = options.contentField || 'content';
    const embeddingField = options.embeddingField || 'embedding';

    console.log(`[PostgresVectorStore] retrieve() called with:`, {
      collectionName,
      options: {
        limit,
        threshold,
        contentField,
        embeddingField,
        embeddingDimensions: options.embeddingDimensions,
      },
      config: {
        defaultModel: this.embeddingModel,
        defaultDimensions: this.embeddingDimensions,
        defaultBaseURL: this.openai.baseURL,
      },
    });

    // ⭐ Use provided dimensions or detect from table
    let tableDimensions = options.embeddingDimensions;
    if (!tableDimensions) {
      tableDimensions = await this.detectTableDimensions(collectionName, embeddingField);
    }

    console.log(`[PostgresVectorStore] Final tableDimensions: ${tableDimensions}`);

    // ⭐ 动态选择对应维度的 embedding 模型
    let actualModel = this.embeddingModel;
    let actualDimensions = this.embeddingDimensions;
    let actualBaseURL: string | undefined = this.openai.baseURL;

    if (tableDimensions && tableDimensions !== this.embeddingDimensions) {
      const modelConfig = this.DIMENSION_MODEL_MAP[tableDimensions];
      if (modelConfig) {
        console.log(`[PostgresVectorStore] 🔧 Switching embedding model for table '${collectionName}':`);
        console.log(`[PostgresVectorStore]   Table dimensions: ${tableDimensions}D`);
        console.log(`[PostgresVectorStore]   Using model: ${modelConfig.model}`);
        actualModel = modelConfig.model;
        actualDimensions = tableDimensions;
        actualBaseURL = modelConfig.baseURL;
      } else {
        console.warn(`[PostgresVectorStore] ⚠️  No embedding model configured for ${tableDimensions}D vectors`);
        console.warn(`[PostgresVectorStore] Table '${collectionName}': ${tableDimensions}D`);
        console.warn(`[PostgresVectorStore] Available dimensions: ${Object.keys(this.DIMENSION_MODEL_MAP).join(', ')}D`);
        console.warn(`[PostgresVectorStore] Falling back to default model (${this.embeddingDimensions}D) - results may be incorrect`);
      }
    }

    const queryEmbedding = await this.embedQueryWithRetry(query, actualModel, actualBaseURL, actualDimensions);

    const client = await this.pool.connect();
    try {
      // Dynamic table name and field names for flexible schema support
      const searchQuery = `
        SELECT id,
               ${contentField} as content,
               metadata,
               1 - (${embeddingField} <=> $1::vector) AS similarity,
               created_at,
               updated_at
        FROM ${collectionName}
        WHERE 1 - (${embeddingField} <=> $1::vector) > $2
        ORDER BY ${embeddingField} <=> $1::vector
        LIMIT $3
      `;

      const result = await client.query<KnowledgeEntry>(
        searchQuery,
        [`[${queryEmbedding.join(',')}]`, threshold, limit]
      );

      console.log(`[PostgresVectorStore] Retrieved ${result.rows.length} entries from ${collectionName} (threshold: ${threshold})`);
      if (result.rows.length > 0) {
        result.rows.forEach((entry, index) => {
          console.log(`  [${index + 1}] similarity: ${entry.similarity?.toFixed(4)}, content: ${entry.content?.substring(0, 50)}...`);
        });
      }

      return result.rows;
    } catch (err) {
      console.error(`PostgreSQL retrieval error for table ${collectionName}:`, err);
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
    this.dimensionCache.clear();
    await this.pool.end();
  }

  /**
   * Detect embedding dimensions for a table by sampling a vector
   */
  private async detectTableDimensions(
    tableName: string,
    embeddingField: string
  ): Promise<number> {
    const cacheKey = `${tableName}.${embeddingField}`;
    const cached = this.dimensionCache.get(cacheKey);
    if (cached) return cached;

    const client = await this.pool.connect();
    try {
      const query = `
        SELECT ${embeddingField}
        FROM ${tableName}
        WHERE ${embeddingField} IS NOT NULL
        LIMIT 1
      `;

      const result = await client.query(query);
      if (result.rows.length === 0) {
        console.warn(`[PostgresVectorStore] No vectors found in ${tableName}.${embeddingField}, using default dimensions: ${this.embeddingDimensions}`);
        return this.embeddingDimensions;
      }

      const vectorValue = result.rows[0][embeddingField];

      // Parse vector dimensions
      let dimensions: number;
      if (typeof vectorValue === 'string') {
        // Format: "[0.1,0.2,0.3,...]" or "0.1,0.2,0.3,..."
        const cleanStr = vectorValue.replace(/^\[|\]$/g, '');
        dimensions = cleanStr.split(',').filter(s => s.trim().length > 0).length;
      } else if (Array.isArray(vectorValue)) {
        dimensions = vectorValue.length;
      } else {
        console.warn(`[PostgresVectorStore] Unknown vector format in ${tableName}.${embeddingField}, using default dimensions: ${this.embeddingDimensions}`);
        return this.embeddingDimensions;
      }

      console.log(`[PostgresVectorStore] Detected dimensions for ${tableName}.${embeddingField}: ${dimensions}`);
      this.dimensionCache.set(cacheKey, dimensions);
      return dimensions;
    } catch (error) {
      console.error(`[PostgresVectorStore] Failed to detect dimensions for ${tableName}:`, error);
      return this.embeddingDimensions;
    } finally {
      client.release();
    }
  }

  private async embedQueryWithRetry(
    text: string,
    model?: string,
    baseURL?: string,
    expectedDimensions?: number
  ): Promise<number[]> {
    const actualModel = model || this.embeddingModel;
    const actualBaseURL = baseURL || this.openai.baseURL;

    const cacheKey = `${actualModel}:${text}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) return cached;

    // ⭐ 如果 baseURL 不同，创建临时客户端
    const client = actualBaseURL && actualBaseURL !== (this.openai.baseURL || '')
      ? new OpenAI({ apiKey: this.openai.apiKey, baseURL: actualBaseURL })
      : this.openai;

    const maxRetries = 3;
    const initialDelay = 1000;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await client.embeddings.create({
          model: actualModel,
          input: text,
        });

        const embedding = response.data[0].embedding;

        // ⭐ 验证返回的维度是否符合预期
        if (expectedDimensions && embedding.length !== expectedDimensions) {
          console.warn(`[PostgresVectorStore] ⚠️  Embedding dimension mismatch!`);
          console.warn(`[PostgresVectorStore]   Expected: ${expectedDimensions}D, Got: ${embedding.length}D`);
          console.warn(`[PostgresVectorStore]   Model: ${actualModel}`);
        }

        this.embeddingCache.set(cacheKey, embedding);
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
