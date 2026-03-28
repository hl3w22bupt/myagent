/**
 * Data Source Manager
 *
 * Manages different data source types (PostgreSQL+pgvector, Qdrant, Milvus, etc.)
 * and discovers available knowledge collections automatically.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Data Source Configuration
 */
export interface DataSourceConfig {
  type: 'postgres-pgvector' | 'lancedb';
  name: string;
  connection: {
    // PostgreSQL fields
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    // LanceDB fields
    uri?: string;
    apiKey?: string;
  };
}

/**
 * Discovered Collection
 */
export interface DiscoveredCollection {
  name: string;
  entryCount: number;
  hasEmbeddings: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Test connection to data source
 */
export async function testConnection(config: DataSourceConfig): Promise<{ success: boolean; error?: string }> {
  try {
    if (config.type === 'postgres-pgvector') {
      const testPool = new Pool({
        host: config.connection.host,
        port: config.connection.port,
        database: config.connection.database,
        user: config.connection.user || 'leo',
        password: config.connection.password,
        max: 1, // Only need one connection to test
      });

      const client = await testPool.connect();
      await client.query('SELECT 1');
      await client.release();
      await testPool.end();

      return { success: true };
    } else if (config.type === 'lancedb') {
      const *lance* = await import('@lancedb/lancedb');

      try {
        const db = await lance.connect(config.connection.uri);
        await db.close();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }

    return { success: false, error: 'Unsupported data source type' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Discover available collections from data source
 * For PostgreSQL, lists all tables that could be knowledge collections
 */
export async function discoverCollections(config: DataSourceConfig): Promise<DiscoveredCollection[]> {
  try {
    if (config.type === 'postgres-pgvector') {
      const discoverPool = new Pool({
        host: config.connection.host,
        port: config.connection.port,
        database: config.connection.database,
        user: config.connection.user || 'leo',
        password: config.connection.password,
        max: 1,
      });

      // Get all tables in the database (exclude system tables)
      const tablesQuery = `
        SELECT
          table_name as name,
          pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN (
            'tasks', 'sessions', 'context_messages', 'schema_migrations',
            'artifacts', 'outputs', 'compression_history', 'favorites',
            'soul_contexts', 'soul_execution_history', 'soul_notifications', 'soul_states',
            'task_contexts', 'token_usage_aggregation_state', 'token_usage_by_model',
            'token_usage_by_skill', 'token_usage_processed_traces', 'token_usage_task', 'users',
            'app_knowledge_mappings', 'knowledge_datasources'
          )
        ORDER BY table_name
      `;

      const tablesResult = await discoverPool.query(tablesQuery);

      const collections: DiscoveredCollection[] = [];

      // For each table, get entry count and check for embedding/vector columns
      for (const row of tablesResult.rows) {
        const tableName = row.name;

        // Get row count
        const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
        const countResult = await discoverPool.query(countQuery);
        const entryCount = parseInt(countResult.rows[0].count);

        // Check if table has an embedding or vector column
        const columnsQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = $1
            AND table_schema = 'public'
            AND (column_name ILIKE '%embedding%' OR column_name ILIKE '%vector%' OR data_type = 'USER-DEFINED')
        `;
        const columnsResult = await discoverPool.query(columnsQuery, [tableName]);
        const hasEmbeddings = columnsResult.rows.length > 0;

        collections.push({
          name: tableName,
          entryCount,
          hasEmbeddings,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await discoverPool.end();
      return collections;
    } else if (config.type === 'lancedb') {
      const *lance* = await import('@lancedb/lancedb');

      try {
        const db = await lance.connect(config.connection.uri);
        const tableNames = await db.tableNames();

        const collections: DiscoveredCollection[] = [];
        for (const name of tableNames) {
          const table = await db.openTable(name);
          const count = await table.count();
          collections.push({
            name,
            entryCount: count,
            hasEmbeddings: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        await db.close();
        return collections;
      } catch (error: any) {
        console.error('Failed to discover LanceDB collections:', error);
        return [];
      }
    }

    return [];
  } catch (error: any) {
    console.error('Failed to discover collections:', error);
    return [];
  }
}

/**
 * Get a persistent connection pool for queries
 */
export function getPool(config: DataSourceConfig): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.connection.host,
      port: config.connection.port,
      database: config.connection.database,
      user: config.connection.user || 'leo',
      password: config.connection.password,
    });
  }
  return pool;
}

/**
 * Close connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
