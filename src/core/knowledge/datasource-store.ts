/**
 * Shared Data Source Storage with Database Persistence
 *
 * Centralized storage for knowledge data sources with PostgreSQL persistence
 */

import { Pool } from 'pg';

export interface DataSource {
  id: string;
  name: string;
  type: 'postgres-pgvector' | 'lancedb';
  connection: {
    // PostgreSQL fields
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    // LanceDB fields
    uri?: string;
    apiKey?: string;
  };
  embedding_model?: string;
  embedding_dimensions?: number;
  embedding_base_url?: string;
  status: 'connected' | 'error';
  appIds: string[];
  createdAt: string;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
      database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
      user: process.env.PG_USER || process.env.DB_USER || 'leo',
    });
  }
  return pool;
}

/**
 * Initialize default data source if not exists
 */
async function initializeDefaultDataSource(): Promise<void> {
  const pool = getPool();

  // Check if default data source exists
  const checkResult = await pool.query('SELECT id FROM knowledge_datasources WHERE id = $1', ['default']);

  if (checkResult.rows.length === 0) {
    // Create default data source from environment variables
    const defaultDataSource = {
      id: 'default',
      name: '默认 PostgreSQL',
      type: 'postgres-pgvector',
      connection_host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      connection_port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
      connection_database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
      connection_user: process.env.PG_USER || process.env.DB_USER || 'leo',
      status: 'connected',
      app_ids: '',
    };

    await pool.query(`
      INSERT INTO knowledge_datasources (id, name, type, connection_host, connection_port, connection_database, connection_user, status, app_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      defaultDataSource.id,
      defaultDataSource.name,
      defaultDataSource.type,
      defaultDataSource.connection_host,
      defaultDataSource.connection_port,
      defaultDataSource.connection_database,
      defaultDataSource.connection_user,
      defaultDataSource.status,
      defaultDataSource.app_ids,
    ]);
  }
}

/**
 * Get all data sources from database
 */
export async function getAllDataSources(): Promise<DataSource[]> {
  const pool = getPool();

  // Ensure default data source exists
  await initializeDefaultDataSource();

  const result = await pool.query('SELECT * FROM knowledge_datasources ORDER BY created_at');

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    connection: {
      host: row.connection_host,
      port: row.connection_port,
      database: row.connection_database,
      user: row.connection_user,
      uri: row.connection_uri,
      apiKey: row.connection_apikey,
    },
    embedding_model: row.embedding_model,
    embedding_dimensions: row.embedding_dimensions,
    embedding_base_url: row.embedding_base_url,
    status: row.status,
    appIds: row.app_ids ? row.app_ids.split(',') : [],
    createdAt: row.created_at,
  }));
}

/**
 * Get data source by ID
 */
export async function getDataSource(id: string): Promise<DataSource | undefined> {
  const pool = getPool();

  const result = await pool.query('SELECT * FROM knowledge_datasources WHERE id = $1', [id]);

  if (result.rows.length === 0) return undefined;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    connection: {
      host: row.connection_host,
      port: row.connection_port,
      database: row.connection_database,
      user: row.connection_user,
      uri: row.connection_uri,
      apiKey: row.connection_apikey,
    },
    embedding_model: row.embedding_model,
    embedding_dimensions: row.embedding_dimensions,
    embedding_base_url: row.embedding_base_url,
    status: row.status,
    appIds: row.app_ids ? row.app_ids.split(',') : [],
    createdAt: row.created_at,
  };
}

/**
 * Add a new data source
 */
export async function addDataSource(dataSource: DataSource): Promise<void> {
  const pool = getPool();

  const queryParams: any[] = [
    dataSource.id,
    dataSource.name,
    dataSource.type,
    dataSource.status,
    dataSource.appIds.join(','),
  ];

  let query = '';

  if (dataSource.type === 'lancedb') {
    query = `
      INSERT INTO knowledge_datasources (id, name, type, connection_uri, connection_apikey, status, app_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    queryParams.push(
      dataSource.connection.uri,
      dataSource.connection.apiKey || ''
    );
  } else {
    query = `
      INSERT INTO knowledge_datasources (id, name, type, connection_host, connection_port, connection_database, connection_user, status, app_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    queryParams.push(
      dataSource.connection.host,
      dataSource.connection.port,
      dataSource.connection.database,
      dataSource.connection.user
    );
  }

  await pool.query(query, queryParams);
}

/**
 * Update data source
 */
export async function updateDataSource(id: string, updates: Partial<DataSource>): Promise<boolean> {
  const pool = getPool();

  const existing = await getDataSource(id);
  if (!existing) return false;

  const merged = { ...existing, ...updates };

  await pool.query(`
    UPDATE knowledge_datasources
    SET name = $1, status = $2, app_ids = $3
    WHERE id = $4
  `, [
    merged.name,
    merged.status,
    merged.appIds.join(','),
    id,
  ]);

  return true;
}

/**
 * Delete data source
 */
export async function deleteDataSource(id: string): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query('DELETE FROM knowledge_datasources WHERE id = $1', [id]);
  return (result.rowCount || 0) > 0;
}

/**
 * Update data source app associations
 */
export async function updateDataSourceApps(id: string, appIds: string[]): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'UPDATE knowledge_datasources SET app_ids = $1 WHERE id = $2',
    [appIds.join(','), id]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Update data source status
 */
export async function updateDataSourceStatus(id: string, status: 'connected' | 'error'): Promise<boolean> {
  const pool = getPool();

  const result = await pool.query(
    'UPDATE knowledge_datasources SET status = $1 WHERE id = $2',
    [status, id]
  );

  return (result.rowCount || 0) > 0;
}
