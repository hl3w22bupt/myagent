/**
 * LanceDB Adapter
 * Implements IVectorStore interface for LanceDB vector database
 */

import * as lance from '@lancedb/lancedb';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import type {
  IVectorStore,
  KnowledgeEntry,
  RetrieveOptions,
  EmbeddingOptions,
} from '../interfaces/vector-store.interface.js';
import type { LanceDBConfig } from '../interfaces/adapter-config.interface.js';
import {
  ValidationError,
  ConnectionError,
  KnowledgeInsertError,
  EmbeddingGenerationError,
} from '../errors/knowledge-errors.js';

export class LanceDBVectorStore implements IVectorStore {
  private db!: lance.Connection;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions: number;
  private readonly CONNECTION_TIMEOUT = 30000;
  private connectionInitialized = false;

  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private readonly MAX_CONTENT_LENGTH = 100000;

  constructor(private config: LanceDBConfig) {
    if (!config.embedding.apiKey) {
      throw new Error('API key is required for LanceDBVectorStore');
    }

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

  private async initializeConnection(): Promise<void> {
    try {
      const connectionPromise = lance.connect(this.config.connection.uri);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
      );

      this.db = await Promise.race([connectionPromise, timeoutPromise]) as lance.Connection;
    } catch (error) {
      throw new ConnectionError(
        `Failed to connect to LanceDB at ${this.config.connection.uri}: ${(error as Error).message}`,
        'lancedb'
      );
    }
  }

  async addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    const sanitizedContent = this.sanitizeContent(content);
    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      throw new ValidationError('Content cannot be empty');
    }

    await this.ensureConnection();

    try {
      const table = await this.openOrCreateTable(collectionName);
      const embedding = await this.embedQueryWithRetry(sanitizedContent);

      const id = `${tenantId}-${collectionName}-${Date.now()}`;

      await table.add([{
        id,
        tenantId,
        content: sanitizedContent,
        metadata: metadata || {},
        vector: embedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);

      return id;
    } catch (error) {
      throw new KnowledgeInsertError(
        `Failed to add knowledge to collection ${collectionName}: ${(error as Error).message}`
      );
    }
  }

  async addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<string[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    await this.ensureConnection();

    try {
      const table = await this.openOrCreateTable(collectionName);
      const ids: string[] = [];
      const data = [];

      for (const entry of entries) {
        const sanitizedContent = this.sanitizeContent(entry.content);
        const embedding = await this.embedQueryWithRetry(sanitizedContent);

        const id = `${tenantId}-${collectionName}-${Date.now()}-${ids.length}`;
        ids.push(id);

        data.push({
          id,
          tenantId,
          content: sanitizedContent,
          metadata: entry.metadata || {},
          vector: embedding,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await table.add(data);
      return ids;
    } catch (error) {
      throw new KnowledgeInsertError(
        `Failed to add batch knowledge to collection ${collectionName}: ${(error as Error).message}`
      );
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

    await this.ensureConnection();

    try {
      const table = await this.db.openTable(collectionName);
      if (!table) return [];

      const queryEmbedding = await this.embedQueryWithRetry(query);
      const limit = options.limit || 5;
      const threshold = options.threshold || 0.7;

      // LanceDB search returns results directly
      const results = await table.search(queryEmbedding).limit(limit * 2).toArray();

      // Post-filter results by tenantId and threshold
      return results
        .filter((r: any) => r.tenantId === tenantId)
        .map((r: any) => ({
          id: r.id,
          tenantId: r.tenantId,
          collectionName,
          content: r.content,
          metadata: r.metadata || {},
          similarity: 1 - (r._distance || 0),
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }))
        .filter((r: any) => (r.similarity || 0) >= threshold)
        .slice(0, limit);
    } catch (error) {
      console.error(`LanceDB retrieval error for collection ${collectionName}:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.ensureConnection();
      const tables = await this.db.tableNames();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  async close(): Promise<void> {
    this.embeddingCache.clear();
    if (this.connectionInitialized) {
      await this.db.close();
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connectionInitialized) {
      await this.initializeConnection();
      this.connectionInitialized = true;
    }
  }

  private async openOrCreateTable(name: string) {
    try {
      return await this.db.openTable(name);
    } catch {
      const schema = [
        { name: 'id', type: 'string' },
        { name: 'tenantId', type: 'string' },
        { name: 'content', type: 'string' },
        { name: 'metadata', type: 'json' },
        { name: 'vector', type: 'vector', dimension: this.embeddingDimensions },
        { name: 'createdAt', type: 'string' },
        { name: 'updatedAt', type: 'string' },
      ];

      return await this.db.createTable(name, schema);
    }
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
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }
}
