/**
 * Custom Error Types for Knowledge Base
 * Provides specific error handling and recovery strategies
 */

export class KnowledgeBaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeBaseError';
  }
}

export class ValidationError extends KnowledgeBaseError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConnectionError extends KnowledgeBaseError {
  constructor(message: string, public readonly dataSourceType: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class KnowledgeInsertError extends KnowledgeBaseError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'KnowledgeInsertError';
  }
}

export class EmbeddingGenerationError extends KnowledgeBaseError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'EmbeddingGenerationError';
  }
}

export class RetrievalError extends KnowledgeBaseError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RetrievalError';
  }
}
