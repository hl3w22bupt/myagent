/**
 * Backfill Token Usage from Traces API
 *
 * This script fetches execution traces from the Motia API and backfills token usage data.
 *
 * Usage:
 *   node scripts/backfill-token-from-api.mjs
 */

import https from 'https';
import { getDataStore } from '../.motia/compiled/src/core/database/data-store.js';

const API_BASE = 'http://localhost:3000';

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[BackfillTokenUsage] Starting token usage backfill from API...');

  try {
    // Get database store
    const store = getDataStore();
    await store.initialize();
    const pool = store.getPool();

    if (!pool) {
      throw new Error('Failed to get PostgreSQL pool');
    }

    console.log('[BackfillTokenUsage] ✓ Database connected');

    // Get all tasks
    console.log('[BackfillTokenUsage] Fetching tasks list...');
    const tasksData = await fetchJSON(`${API_BASE}/api/tasks`);

    if (!tasksData.success || !tasksData.data) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = tasksData.data;
    console.log(`[BackfillTokenUsage] ✓ Found ${tasks.length} tasks`);

    let processedTraces = 0;
    let processedTasks = 0;
    let skippedTasks = 0;

    const client = await pool.connect();

    try {
      for (const task of tasks) {
        const taskId = task.id;

        try {
          // Fetch traces for this task
          const tracesData = await fetchJSON(`${API_BASE}/api/tasks/${taskId}/traces`);

          if (!tracesData.success || !tracesData.traces) {
            console.log(`[BackfillTokenUsage] Skipping ${taskId} - no traces`);
            skippedTasks++;
            continue;
          }

          const traces = tracesData.traces;
          let taskTokenTotal = 0;
          let taskPromptTotal = 0;
          let taskCompletionTotal = 0;
          let llmCallCount = 0;
          let firstCallAt = null;
          let lastCallAt = null;

          // Process llm_call traces
          for (const trace of traces) {
            if (trace.stage !== 'llm_call' || !trace.metadata) {
              continue;
            }

            const { llmResponse } = trace.metadata;
            if (!llmResponse || !llmResponse.totalTokens) {
              continue;
            }

            const { promptTokens, completionTokens, totalTokens } = llmResponse;

            // Accumulate task totals
            taskTokenTotal += totalTokens || 0;
            taskPromptTotal += promptTokens || 0;
            taskCompletionTotal += completionTokens || 0;
            llmCallCount++;

            // Track timestamps
            const timestamp = new Date(trace.timestamp);
            if (!firstCallAt || timestamp < firstCallAt) {
              firstCallAt = timestamp;
            }
            if (!lastCallAt || timestamp > lastCallAt) {
              lastCallAt = timestamp;
            }

            processedTraces++;

            // Mark trace as processed (using trace.id)
            try {
              await client.query(
                'INSERT INTO token_usage_processed_traces (trace_id) VALUES ($1) ON CONFLICT DO NOTHING',
                [trace.id]
              );
            } catch (err) {
              // Ignore duplicate errors
              if (!err.message.includes('duplicate')) {
                console.warn(`[BackfillTokenUsage] Warning: Could not mark trace ${trace.id} as processed`);
              }
            }
          }

          // Insert task summary
          if (llmCallCount > 0) {
            await client.query(`
              INSERT INTO token_usage_task (task_id, total_tokens, prompt_tokens, completion_tokens, llm_calls_count, first_call_at, last_call_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              ON CONFLICT (task_id) DO UPDATE SET
                total_tokens = EXCLUDED.total_tokens,
                prompt_tokens = EXCLUDED.prompt_tokens,
                completion_tokens = EXCLUDED.completion_tokens,
                llm_calls_count = EXCLUDED.llm_calls_count,
                first_call_at = CASE
                  WHEN EXCLUDED.first_call_at < token_usage_task.first_call_at OR token_usage_task.first_call_at IS NULL THEN EXCLUDED.first_call_at
                  ELSE token_usage_task.first_call_at
                END,
                last_call_at = CASE
                  WHEN EXCLUDED.last_call_at > token_usage_task.last_call_at OR token_usage_task.last_call_at IS NULL THEN EXCLUDED.last_call_at
                  ELSE token_usage_task.last_call_at
                END,
                updated_at = NOW()
            `, [
              taskId,
              taskTokenTotal,
              taskPromptTotal,
              taskCompletionTotal,
              llmCallCount,
              firstCallAt,
              lastCallAt,
            ]);

            processedTasks++;
            console.log(`[BackfillTokenUsage] ✓ Processed ${taskId}: ${llmCallCount} LLM calls, ${taskTokenTotal} tokens`);
          } else {
            skippedTasks++;
          }

        } catch (error) {
          console.error(`[BackfillTokenUsage] ✗ Error processing task ${taskId}:`, error.message);
        }

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Show summary
      console.log('[BackfillTokenUsage] ✓ Backfill complete');
      console.log(`  Processed Tasks: ${processedTasks}`);
      console.log(`  Skipped Tasks: ${skippedTasks}`);
      console.log(`  Processed Traces: ${processedTraces}`);

      // Get summary statistics
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
