/**
 * Backfill Token Usage from Traces API
 *
 * This script fetches execution traces from the Motia API and backfills token usage data.
 *
 * Usage:
 *   node scripts/backfill-token-from-api.js
 */

import pg from 'pg';

const API_BASE = 'http://localhost:3000';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'myagent',
  user: 'leo',
});

async function fetchJSON(url) {
  const response = await fetch(url);
  return await response.json();
}

async function main() {
  console.log('[BackfillTokenUsage] Starting token usage backfill from API...');

  const client = await pool.connect();

  try {
    // Get all tasks from database
    console.log('[BackfillTokenUsage] Fetching tasks list from database...');
    const tasksResult = await client.query('SELECT id FROM tasks ORDER BY created_at DESC');

    const tasks = tasksResult.rows;
    console.log(`[BackfillTokenUsage] ✓ Found ${tasks.length} tasks`);

    let processedTraces = 0;
    let processedTasks = 0;
    let skippedTasks = 0;

    for (const task of tasks) {
      const taskId = task.id;

      try {
        // Fetch traces for this task
        console.log(`[BackfillTokenUsage] Fetching traces for ${taskId}...`);
        const tracesData = await fetchJSON(`${API_BASE}/api/tasks/${taskId}/traces`);
        console.log(`[BackfillTokenUsage] Traces response: success=${tracesData.success}, traces count=${tracesData.traces?.length || 0}`);

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

        console.log(`[BackfillTokenUsage] Processing ${traces.length} traces for ${taskId}...`);

        // Process traces with LLM response data
        // Note: LLM calls may have various stage names (e.g., 'llm_call', 'llm_call - tool_use_continuation')
        // We check for llmResponse in metadata instead of strict stage matching
        for (const trace of traces) {
          if (!trace.metadata) {
            continue;
          }

          const { llmResponse } = trace.metadata;
          if (!llmResponse || !llmResponse.totalTokens) {
            continue;
          }

          console.log(`[BackfillTokenUsage] Found LLM call: ${trace.id}, tokens: ${llmResponse.totalTokens}`);

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
          console.log(`[BackfillTokenUsage] Inserting task summary for ${taskId}: ${llmCallCount} calls, ${taskTokenTotal} tokens...`);
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

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('[BackfillUsage] ✗ Backfill failed:', error.message);
    if (error.stack) {
      console.error('[BackfillUsage] Stack trace:', error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

// Run the script
main();
