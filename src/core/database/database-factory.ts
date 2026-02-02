/**
 * Database Factory
 *
 * Factory function to create database instances based on configuration.
 * Supports multiple backends: PostgreSQL, SQLite.
 */

import type { Database } from './database.interface';
import { DataStore as SqliteDataStore } from './data-store';
import { PostgresDataStore } from './postgres-store';

export type DatabaseBackend = 'sqlite' | 'postgres';

export interface DatabaseConfig {
  /** Database backend to use */
  backend?: DatabaseBackend;
  /** Database path (for SQLite) */
  dbPath?: string;
  /** PostgreSQL connection config */
  postgres?: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
}

/**
 * Get database instance based on configuration
 *
 * Priority:
 * 1. DATABASE_BACKEND environment variable
 * 2. backend parameter in config
 * 3. Default to 'sqlite'
 */
export function createDatabase(config?: DatabaseConfig): Database {
  const backend = config?.backend || (process.env.DATABASE_BACKEND as DatabaseBackend) || 'sqlite';

  console.log('[DatabaseFactory] Creating database instance with backend:', backend);

  switch (backend) {
    case 'postgres':
      return new PostgresDataStore(config?.postgres);
    case 'sqlite':
      return new SqliteDataStore(config?.dbPath);
    default:
      console.warn(`[DatabaseFactory] Unknown backend: ${backend}, falling back to sqlite`);
      return new SqliteDataStore(config?.dbPath);
  }
}

/**
 * Get singleton database instance
 *
 * Uses global variable to ensure single instance across hot-reloads
 */
export function getDatabase(config?: DatabaseConfig): Database {
  const backend = config?.backend || (process.env.DATABASE_BACKEND as DatabaseBackend) || 'sqlite';
  const globalKey = `__database_${backend}`;

  if (!(global as any)[globalKey]) {
    console.log(`[DatabaseFactory] Creating global singleton database (${backend})`);
    (global as any)[globalKey] = createDatabase(config);
  } else {
    console.log(`[DatabaseFactory] Reusing global singleton database (${backend})`);
  }

  return (global as any)[globalKey];
}
