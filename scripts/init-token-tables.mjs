/**
 * Initialize Token Usage Database Tables
 *
 * This script creates the necessary database tables and indexes for token usage tracking.
 *
 * Usage:
 *   node scripts/init-token-tables.mjs
 */

import { getDataStore } from '../.motia/compiled/src/core/database/data-store.js';

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

    // Create tables directly
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create token_usage_task table
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage_task (
          task_id VARCHAR(255) PRIMARY KEY,
          total_tokens BIGINT NOT NULL DEFAULT 0,
          prompt_tokens BIGINT NOT NULL DEFAULT 0,
          completion_tokens BIGINT NOT NULL DEFAULT 0,
          llm_calls_count INTEGER NOT NULL DEFAULT 0,
          first_call_at TIMESTAMP,
          last_call_at TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('[InitTokenTables] ✓ Table token_usage_task created');

      // Create indexes for token_usage_task
      await client.query('CREATE INDEX IF NOT EXISTS idx_token_usage_task_updated_at ON token_usage_task(updated_at DESC)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_token_usage_task_first_call_at ON token_usage_task(first_call_at DESC)');
      console.log('[InitTokenTables] ✓ Indexes for token_usage_task created');

      // Create token_usage_processed_traces table
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage_processed_traces (
          trace_id VARCHAR(255) PRIMARY KEY,
          processed_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('[InitTokenTables] ✓ Table token_usage_processed_traces created');

      // Create token_usage_aggregation_state table
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage_aggregation_state (
          key VARCHAR(255) PRIMARY KEY,
          last_aggregated_at TIMESTAMP,
          metadata JSONB
        )
      `);
      console.log('[InitTokenTables] ✓ Table token_usage_aggregation_state created');

      // Create token_usage_by_model table
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage_by_model (
          model VARCHAR(255) PRIMARY KEY,
          total_tokens BIGINT NOT NULL DEFAULT 0,
          prompt_tokens BIGINT NOT NULL DEFAULT 0,
          completion_tokens BIGINT NOT NULL DEFAULT 0,
          llm_calls_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('[InitTokenTables] ✓ Table token_usage_by_model created');

      // Create token_usage_by_skill table
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage_by_skill (
          skill_name VARCHAR(255) PRIMARY KEY,
          total_tokens BIGINT NOT NULL DEFAULT 0,
          prompt_tokens BIGINT NOT NULL DEFAULT 0,
          completion_tokens BIGINT NOT NULL DEFAULT 0,
          llm_calls_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('[InitTokenTables] ✓ Table token_usage_by_skill created');

      await client.query('COMMIT');

      console.log('[InitTokenTables] ✓ All database tables initialized successfully');
      console.log('[InitTokenTables] Created tables:');
      console.log('  - token_usage_task (task-level token usage)');
      console.log('  - token_usage_processed_traces (idempotency tracking)');
      console.log('  - token_usage_aggregation_state (aggregation checkpoint)');
      console.log('  - token_usage_by_model (model-level aggregation)');
      console.log('  - token_usage_by_skill (skill-level aggregation)');
      console.log('[InitTokenTables] Created indexes for performance optimization');
      console.log('[InitTokenTables] ✓ Initialization complete');
      process.exit(0);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[InitTokenTables] ✗ Initialization failed:', error.message);
    if (error.stack) {
      console.error('[InitTokenTables] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
