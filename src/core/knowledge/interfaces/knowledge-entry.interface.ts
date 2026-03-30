/**
 * Knowledge Entry Interface
 * Unified knowledge entry structure across all vector stores
 */

export interface KnowledgeEntry {
  id: string | number;
  tenantId: string;
  collectionName: string;
  content: string;
  metadata?: Record<string, any>;
  similarity?: number;  // Computed during retrieval
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrieveOptions {
  limit?: number;           // Default: 5
  threshold?: number;       // Default: 0.7
  contentField?: string;    // Content field name (e.g., 'content', 'text')
  embeddingField?: string;  // Embedding field name (e.g., 'embedding', 'vector')
  embeddingDimensions?: number; // Table's embedding dimensions (for validation)
}

export interface EmbeddingOptions {
  maxRetries?: number;      // Default: 3
  initialDelay?: number;    // Default: 1000ms
}
