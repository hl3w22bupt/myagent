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
export { Database } from './database.interface';

// Implementations
export { DataStore as SqliteDataStore } from './data-store';
export { PostgresDataStore } from './postgres-store';

// Factory
export { createDatabase, getDatabase, type DatabaseBackend, type DatabaseConfig } from './database-factory';

// Types
export type {
  Task,
  TaskStatus,
  Session,
  CreateTaskData,
} from './data-store';

export type {
  TaskContext,
  ArtifactIndex,
  CompressionHistory,
} from './context-types';

// Legacy exports (for backward compatibility)
export { getDataStore, setDataStore } from './data-store';
