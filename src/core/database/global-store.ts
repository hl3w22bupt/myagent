/**
 * Global PostgreSQL Data Store Singleton
 *
 * Ensures only ONE database instance is created for the entire application lifecycle.
 * This is critical for performance - creating multiple instances causes severe slowdowns.
 */

import { PostgresDataStore } from './postgres-store.js';

let globalPostgresStore: PostgresDataStore | null = null;
let isInitializing = false;

export async function getGlobalPostgresStore(): Promise<PostgresDataStore> {
  // Return existing instance if available
  if (globalPostgresStore) {
    return globalPostgresStore;
  }

  // Wait if initialization is in progress
  if (isInitializing) {
    // Poll until initialization completes
    await new Promise(resolve => setTimeout(resolve, 100));
    return getGlobalPostgresStore();
  }

  // Start initialization
  isInitializing = true;
  console.log('[GlobalPostgresStore] Creating global singleton instance...');

  try {
    globalPostgresStore = new PostgresDataStore();
    await globalPostgresStore.initialize();
    console.log('[GlobalPostgresStore] Global singleton initialized successfully');
    return globalPostgresStore;
  } finally {
    isInitializing = false;
  }
}

export function hasGlobalPostgresStore(): boolean {
  return globalPostgresStore !== null;
}
