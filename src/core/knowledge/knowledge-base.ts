/**
 * MyAgent Knowledge Base Management
 *
 * Implements RAG (Retrieval-Augmented Generation) using pgvector.
 * Supports multi-tenant knowledge collections with vector similarity search.
 *
 * Key Features:
 * - Vector embeddings using OpenAI text-embedding-3-small (1536 dimensions)
 * - Multi-tenant collections using tenantId:collectionName namespace
 * - Content sanitization to prevent injection attacks
 * - LRU cache for embeddings (5-minute TTL)
 * - Connection pooling for production scalability
 */

import { Pool, PoolConfig, QueryResult } from 'pg';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';

/**
 * Knowledge entry structure
 */
export interface KnowledgeEntry {
  id: number;
  tenantId: string;
  collectionName: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  similarity?: number;  // Returned during retrieval
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for knowledge retrieval
 */
export interface RetrieveOptions {
  limit?: number;           // Maximum number of results (default: 5)
  threshold?: number;       // Minimum similarity score (default: 0.7)
}

/**
 * Configuration for KnowledgeBase
 */
export interface KnowledgeBaseConfig {
  db: PoolConfig;
  openaiApiKey: string;
  embeddingModel?: string;  // Default: 'text-embedding-3-small'
  cacheTtl?: number;        // Cache TTL in milliseconds (default: 300000 = 5 minutes)
}

/**
 * Knowledge Base Manager
 *
 * Manages knowledge storage and retrieval using vector similarity search.
 */
export class KnowledgeBase {
  private pool: Pool;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly embeddingModel: string;

  // Collection name validation regex (alphanumeric, dash, underscore)
  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

  // Maximum content length
  private readonly MAX_CONTENT_LENGTH = 100000;

  constructor(config: KnowledgeBaseConfig) {
    // Use Pool connection pool to avoid connection leaks
    this.pool = new Pool(config.db);

    // Initialize OpenAI client
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });

    // Set embedding model
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-small';

    // Initialize LRU cache for embeddings (max 1000 entries, 5-minute TTL)
    this.embeddingCache = new LRUCache<string, number[]>({
      max: 1000,
      ttl: config.cacheTtl || 300000,  // 5 minutes default
    });
  }

  /**
   * Add knowledge to a collection
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param collectionName - Collection name (alphanumeric, dash, underscore only)
   * @param content - Knowledge content to store
   * @param metadata - Optional metadata (JSON)
   * @returns The created knowledge entry ID
   */
  async addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<number> {
    // Validate collection name
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new Error(
        `Invalid collection name: ${collectionName}. ` +
        `Collection names must contain only alphanumeric characters, dashes, and underscores.`
      );
    }

    // Sanitize content to prevent injection attacks
    const sanitizedContent = this.sanitizeContent(content);

    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      throw new Error('Content cannot be empty after sanitization');
    }

    // Generate embedding
    const embedding = await this.embedQuery(sanitizedContent);

    // Use pool connection (automatically managed)
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
      throw err;
    } finally {
      // Release connection back to pool
      client.release();
    }
  }

  /**
   * Retrieve relevant knowledge from a collection
   *
   * Uses vector similarity search to find the most relevant knowledge entries.
   *
   * @param tenantId - Tenant identifier
   * @param collectionName - Collection name
   * @param query - Query text to search for
   * @param options - Retrieval options (limit, threshold)
   * @returns Array of relevant knowledge entries with similarity scores
   */
  async retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options: RetrieveOptions = {}
  ): Promise<KnowledgeEntry[]> {
    const limit = options.limit || 5;
    const threshold = options.threshold || 0.7;

    // Validate collection name
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new Error(`Invalid collection name: ${collectionName}`);
    }

    // Generate query embedding
    const queryEmbedding = await this.embedQuery(query);

    // Use pool connection (automatically managed)
    const client = await this.pool.connect();

    try {
      // Vector similarity search using cosine distance
      // Cosine distance: <=> operator, converted to similarity: 1 - distance
      const searchQuery = `
        SELECT id, tenant_id, collection_name, content, metadata, embedding,
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
    } finally {
      // Release connection back to pool
      client.release();
    }
  }

  /**
   * Generate vector embedding for text
   *
   * Uses LRU cache to avoid re-embedding the same text.
   *
   * @param text - Text to embed
   * @returns Vector embedding (1536 dimensions for text-embedding-3-small)
   */
  private async embedQuery(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate embedding using OpenAI API
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    const embedding = response.data[0].embedding;

    // Store in cache
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Sanitize content to prevent injection attacks
   *
   * Removes potentially dangerous content:
   * - HTML tags
   * - SQL injection patterns
   * - Excessive whitespace
   * - Control characters
   *
   * @param content - Raw content
   * @returns Sanitized content
   */
  private sanitizeContent(content: string): string {
    // Truncate to maximum length
    if (content.length > this.MAX_CONTENT_LENGTH) {
      content = content.substring(0, this.MAX_CONTENT_LENGTH);
    }

    // Remove HTML tags (basic protection)
    content = content.replace(/<[^>]*>/g, '');

    // Remove control characters (except newline, tab, carriage return)
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Remove SQL injection patterns (basic protection)
    // Note: Parameterized queries in the database layer provide the primary protection
    content = content.replace(/;.*DROP TABLE.*/gi, '');
    content = content.replace(/;.*DELETE FROM.*/gi, '');
    content = content.replace(/;.*EXEC.*/gi, '');

    // Normalize whitespace
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }

  /**
   * Clean up resources
   *
   * Closes the connection pool and clears the cache.
   */
  async close(): Promise<void> {
    this.embeddingCache.clear();
    await this.pool.end();
  }
}
