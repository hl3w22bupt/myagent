/**
 * Initialize Token Usage Database Tables
 *
 * This script creates the necessary database tables and indexes for token usage tracking.
 * Run this script during initial setup or when upgrading to add token usage tracking.
 *
 * Usage:
 *   ts-node scripts/init-token-tables.ts
 *   OR
 *   npm run init-token-tables (if added to package.json)
 *
 * Environment Variables:
 *   DATABASE_BACKEND=postgres (required)
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 */

import { getDataStore } from '../src/core/database/data-store';
import { PostgresTokenUsageStorage } from '../steps/token-usage/storage/postgres-token-storage';

async function main() {
  console.log('[InitTokenTables] Starting token usage table initialization...');

  try {
    // Get the database store
    const store = getDataStore();
    await store.initialize();
    console.log('[InitTokenTables] ✓ Database store initialized');

    // Get the PostgreSQL pool from the store
    const pool =
      'getPool' in store && typeof store.getPool === 'function'
        ? store.getPool()
        : undefined;

    if (!pool) {
      console.error('[InitTokenTables] ✗ Failed to get PostgreSQL pool');
      console.error('[InitTokenTables] Make sure DATABASE_BACKEND=postgres is set');
      process.exit(1);
    }

    console.log('[InitTokenTables] ✓ PostgreSQL pool obtained');

    // Create the token usage storage instance
    const storage = new PostgresTokenUsageStorage(pool);
    console.log('[InitTokenTables] ✓ Token usage storage instance created');

    // Initialize all tables
    await storage.initializeTables();
    console.log('[InitTokenTables] ✓ Database tables initialized successfully');

    // List the tables that were created
    console.log('[InitTokenTables] Created tables:');
    console.log('  - token_usage_task (task-level token usage)');
    console.log('  - token_usage_processed_traces (idempotency tracking)');
    console.log('  - token_usage_aggregation_state (aggregation checkpoint)');
    console.log('  - token_usage_by_model (model-level aggregation)');
    console.log('  - token_usage_by_skill (skill-level aggregation)');
    console.log('[InitTokenTables] Created indexes for performance optimization');

    console.log('[InitTokenTables] ✓ Initialization complete');
    process.exit(0);
  } catch (error: any) {
    console.error('[InitTokenTables] ✗ Initialization failed:', error.message);
    if (error.stack) {
      console.error('[InitTokenTables] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
