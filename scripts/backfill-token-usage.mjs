/**
 * Backfill Token Usage Data
 *
 * This script reads historical execution traces and calculates token usage statistics.
 * It processes traces that have metadata.llmResponse and populates the token_usage tables.
 *
 * Usage:
 *   DATABASE_BACKEND=postgres node scripts/backfill-token-usage.mjs
 */

import { getDataStore } from '../.motia/compiled/src/core/database/data-store.js';

async function main() {
  console.log('[BackfillTokenUsage] Starting token usage backfill...');

  try {
    // Get the database store
    const store = getDataStore();
    await store.initialize();
    console.log('[BackfillTokenUsage] ✓ Database store initialized');

    // Get the PostgreSQL pool
    const pool =
      'getPool' in store && typeof store.getPool === 'function'
        ? store.getPool()
        : undefined;

    if (!pool) {
      console.error('[BackfillTokenUsage] ✗ Failed to get PostgreSQL pool');
      process.exit(1);
    }

    console.log('[BackfillTokenUsage] ✓ PostgreSQL pool obtained');

    const client = await pool.connect();

    try {
      // Check if there are any execution traces
      const tracesResult = await client.query(`
        SELECT
          trace_id,
          task_id,
          agent_id,
          stage,
          timestamp,
          metadata
        FROM execution_traces
        WHERE stage = 'llm_call'
        AND metadata IS NOT NULL
        ORDER BY timestamp ASC
      `);

      const traces = tracesResult.rows;

      console.log(`[BackfillTokenUsage] Found ${traces.length} LLM call traces`);

      if (traces.length === 0) {
        console.log('[BackfillTokenUsage] No traces to process, exiting');
        process.exit(0);
      }

      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Process each trace
      for (const trace of traces) {
        try {
          const metadata = typeof trace.metadata === 'string'
            ? JSON.parse(trace.metadata)
            : trace.metadata;

          if (!metadata.llmResponse) {
            skippedCount++;
            continue;
          }

          const { llmResponse, llmProvider, llmModel } = metadata;
          const { promptTokens, completionTokens, totalTokens } = llmResponse;

          // Validate token data
          if (promptTokens === undefined ||
              completionTokens === undefined ||
              totalTokens === undefined) {
            console.log(`[BackfillTokenUsage] Skipping ${trace.trace_id} - incomplete token data`);
            skippedCount++;
            continue;
          }

          // Check if already processed
          const existingProcessed = await client.query(
            'SELECT trace_id FROM token_usage_processed_traces WHERE trace_id = $1',
            [trace.trace_id]
          );

          if (existingProcessed.rows.length > 0) {
            console.log(`[BackfillTokenUsage] Skipping ${trace.trace_id} - already processed`);
            skippedCount++;
            continue;
          }

          // Start transaction
          await client.query('BEGIN');

          try {
            // Update or insert task token usage
            await client.query(`
              INSERT INTO token_usage_task (task_id, total_tokens, prompt_tokens, completion_tokens, llm_calls_count, first_call_at, last_call_at, updated_at)
              VALUES ($1, $2, $3, $4, 1, $5, $6, NOW())
              ON CONFLICT (task_id) DO UPDATE SET
                total_tokens = token_usage_task.total_tokens + $2,
                prompt_tokens = token_usage_task.prompt_tokens + $3,
                completion_tokens = token_usage_task.completion_tokens + $4,
                llm_calls_count = token_usage_task.llm_calls_count + 1,
                last_call_at = CASE
                  WHEN $6 > token_usage_task.last_call_at THEN $6
                  ELSE token_usage_task.last_call_at
                END,
                updated_at = NOW()
            `, [
              trace.task_id,
              totalTokens,
              promptTokens,
              completionTokens,
              trace.timestamp, // first_call_at
              trace.timestamp, // last_call_at
            ]);

            // Mark trace as processed
            await client.query(
              'INSERT INTO token_usage_processed_traces (trace_id) VALUES ($1)',
              [trace.trace_id]
            );

            await client.query('COMMIT');

            processedCount++;
            if (processedCount % 100 === 0) {
              console.log(`[BackfillTokenUsage] Processed ${processedCount}/${traces.length} traces...`);
            }

          } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
          }

        } catch (error) {
          console.error(`[BackfillTokenUsage] ✗ Error processing trace ${trace.trace_id}:`, error.message);
          errorCount++;
        }
      }

      console.log('[BackfillTokenUsage] ✓ Backfill complete');
      console.log(`  Processed: ${processedCount} traces`);
      console.log(`  Skipped: ${skippedCount} traces`);
      console.log(`  Errors: ${errorCount} traces`);

      // Show summary statistics
      const summaryResult = await client.query(`
        SELECT
          COUNT(*) as task_count,
          SUM(total_tokens) as total_tokens,
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(llm_calls_count) as total_calls
        FROM token_usage_task
      `);

      const summary = summaryResult.rows[0];

      console.log('[BackfillTokenUsage] 📊 Summary Statistics:');
      console.log(`  Total Tasks: ${summary.task_count}`);
      console.log(`  Total Tokens: ${summary.total_tokens || 0}`);
      console.log(`  Prompt Tokens: ${summary.prompt_tokens || 0}`);
      console.log(`  Completion Tokens: ${summary.completion_tokens || 0}`);
      console.log(`  Total LLM Calls: ${summary.total_calls || 0}`);

      process.exit(0);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[BackfillTokenUsage] ✗ Backfill failed:', error.message);
    if (error.stack) {
      console.error('[BackfillTokenUsage] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
