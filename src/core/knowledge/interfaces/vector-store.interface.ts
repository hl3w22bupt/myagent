/**
 * Vector Store Interface
 * Abstraction for different vector database backends
 */

import type { KnowledgeEntry, RetrieveOptions, EmbeddingOptions } from './knowledge-entry.interface.js';

// Re-export types for convenience
export type { KnowledgeEntry, RetrieveOptions, EmbeddingOptions };

export interface IVectorStore {
  /**
   * Add a single knowledge entry
   * @returns ID of the created entry
   */
  addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string | number>;

  /**
   * Add multiple knowledge entries in batch
   * @returns Array of created entry IDs
   */
  addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<(string | number)[]>;

  /**
   * Retrieve knowledge entries by vector similarity
   * @returns Array of relevant entries with similarity scores
   */
  retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]>;

  /**
   * Health check for the vector store
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;

  /**
   * Close connection and cleanup resources
   */
  close(): Promise<void>;
}
