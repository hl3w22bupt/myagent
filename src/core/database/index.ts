/**
 * Database Module
 *
 * Unified database access with multiple backend support.
 *
 * Usage:
 * ```typescript
 * import { getDatabase } from '@/core/database';
 *
 * const db = getDatabase();
 * await db.initialize();
 * const task = await db.getTask(taskId);
 * ```
 */

// Database interface
export { Database } from './database.interface.js';

// Implementations
export { DataStore as SqliteDataStore } from './data-store.js';
export { PostgresDataStore } from './postgres-store.js';

// Factory
export { createDatabase, getDatabase, type DatabaseBackend, type DatabaseConfig } from './database-factory.js';

// Types
export type {
  Task,
  TaskStatus,
  Session,
  CreateTaskData,
} from './data-store.js';

export type {
  TaskContext,
  ArtifactIndex,
  CompressionHistory,
} from './context-types.js';

// Legacy exports (for backward compatibility)
export { getDataStore, setDataStore } from './data-store.js';
