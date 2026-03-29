/**
 * Vector Store Interface
 * Abstraction for different vector database backends
 */

import type { KnowledgeEntry, RetrieveOptions, EmbeddingOptions } from './knowledge-entry.interface';

// Re-export types for convenience
export type { KnowledgeEntry, RetrieveOptions, EmbeddingOptions };

export interface IVectorStore {
  /**
   * Retrieve knowledge entries by vector similarity
   * @returns Array of relevant entries with similarity scores
   */
  retrieve(
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
