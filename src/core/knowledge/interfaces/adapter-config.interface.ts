/**
 * Vector Store Adapter Configuration
 * Type-safe configuration with validation
 */

export type VectorStoreType = 'postgres-pgvector' | 'lancedb';

// Configuration constraints
export const CONFIG_CONSTRAINTS = {
  MIN_EMBEDDING_DIMENSIONS: 128,
  MAX_EMBEDDING_DIMENSIONS: 4096,
  MIN_CACHE_TTL: 60000,      // 1 minute
  MAX_CACHE_TTL: 3600000,    // 60 minutes
  LANCEDB_URI_PATTERN: /^(\.|\.\/|[a-zA-Z]:|s3:\/\/|gs:\/\/|az:\/\/)/,
  POSTGRES_PORT_RANGE: { min: 1, max: 65535 },
} as const;

export interface BaseVectorStoreConfig {
  type: VectorStoreType;
  embedding: {
    apiKey: string;
    baseURL?: string;
    model: string;
    dimensions: number;
  };
  cacheTtl?: number;
}

export interface PostgresConfig extends BaseVectorStoreConfig {
  type: 'postgres-pgvector';
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
}

export interface LanceDBConfig extends BaseVectorStoreConfig {
  type: 'lancedb';
  connection: {
    uri: string;
    apiKey?: string;
  };
}

export type VectorStoreConfig = PostgresConfig | LanceDBConfig;

export function validateConfig(config: VectorStoreConfig): void {
  const { dimensions } = config.embedding;
  if (dimensions < CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS ||
      dimensions > CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimensions must be between ${CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS} and ${CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS}`
    );
  }

  const cacheTtl = config.cacheTtl || 300000;
  if (cacheTtl < CONFIG_CONSTRAINTS.MIN_CACHE_TTL ||
      cacheTtl > CONFIG_CONSTRAINTS.MAX_CACHE_TTL) {
    throw new Error(
      `Cache TTL must be between ${CONFIG_CONSTRAINTS.MIN_CACHE_TTL} and ${CONFIG_CONSTRAINTS.MAX_CACHE_TTL} ms`
    );
  }

  if (config.type === 'postgres-pgvector') {
    const { port } = config.connection;
    if (port < CONFIG_CONSTRAINTS.POSTGRES_PORT_RANGE.min ||
        port > CONFIG_CONSTRAINTS.POSTGRES_PORT_RANGE.max) {
      throw new Error(`PostgreSQL port must be between 1 and 65535`);
    }
  } else if (config.type === 'lancedb') {
    if (!CONFIG_CONSTRAINTS.LANCEDB_URI_PATTERN.test(config.connection.uri)) {
      throw new Error(
        `LanceDB URI must start with ./, ../, [drive]:/, s3://, gs://, or az://`
      );
    }
  }
}
