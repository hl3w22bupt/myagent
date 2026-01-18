/**
 * Agent Result Logger Step.
 *
 * Listens to agent task completion events and logs results.
 * Provides audit trail and execution history.
 *
 * FIX: Added circular reference detection and history size limits
 * to prevent Motia wrapObject infinite recursion bug.
 * See: https://github.com/motiadev/motia/issues/xxx
 */

import { z } from 'zod';
import { EventConfig } from 'motia';
import { safeStateSet, hasCircularReference, safeClone } from '../../src/utils/state-safety';

/**
 * Configuration for execution history limits.
 * Reduced from 100 to 20 to prevent wrapObject stack overflow.
 */
const MAX_HISTORY_SIZE = 20;

/**
 * Simplify history entry to prevent complex nested structures.
 * Reduces memory and prevents wrapObject issues.
 */
function simplifyHistoryEntry(entry: any): any {
  return {
    taskId: entry.taskId,
    timestamp: entry.timestamp,
    task: entry.task,
    success: entry.success,
    sessionId: entry.sessionId,
    output: entry.output, // 不截断，保留完整输出
    error: entry.error,
    executionTime: entry.executionTime,
    metadata: entry.metadata,
  };
}

/**
 * Input schema for result logger.
 *
 * Handles both successful completions (agent.task.completed)
 * and failures (agent.task.failed) with different data structures.
 */
export const inputSchema = z
  .object({
    /**
     * Task ID for tracking.
     */
    taskId: z.string().optional(),

    /**
     * Task that was executed.
     */
    task: z.string().optional(),

    /**
     * Session ID.
     */
    sessionId: z.string().optional(),

    /**
     * Nested result object from Agent execution (present in completed events).
     */
    result: z
      .object({
        /**
         * Whether execution succeeded.
         */
        success: z.boolean(),

        /**
         * Output from agent execution.
         */
        output: z.string().optional(),

        /**
         * Error message if execution failed.
         */
        error: z.string().optional(),

        /**
         * Execution time in ms.
         */
        executionTime: z.number().optional(),

        /**
         * State information.
         */
        state: z
          .object({
            conversationLength: z.number().optional(),
            executionCount: z.number().optional(),
            variablesCount: z.number().optional(),
          })
          .optional(),

        /**
         * Execution metadata.
         */
        metadata: z
          .object({
            llmCalls: z.number(),
            skillCalls: z.number(),
            totalTokens: z.number(),
          })
          .optional(),
      })
      .optional(),

    /**
     * Direct error field (present in failed events).
     */
    error: z.string().optional(),

    /**
     * Stack trace (present in failed events).
     */
    stack: z.string().optional(),
  })
  .passthrough();

/**
 * Result Logger Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'result-logger',
  description: 'Logs agent task execution results for audit trail',

  /**
   * Subscribe to both successful and failed agent task events.
   */
  subscribes: ['agent.task.completed', 'agent.task.failed'],

  /**
   * Optionally emit analytics events.
   */
  emits: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Parse unified format result from output string.
 *
 * Skills return results in Python dict syntax embedded in output:
 * output={'result_type': 'video', 'success': True, ...}
 *
 * This function extracts and parses that structured result.
 */
function parseUnifiedResult(output: string | undefined): Record<string, unknown> | null {
  if (!output || typeof output !== 'string') {
    return null;
  }

  try {
    // Look for Python dict pattern: output={...}
    const outputMatch = output.indexOf('output={');
    if (outputMatch === -1) {
      return null;
    }

    // Find the complete dict by counting braces
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let dictEnd = -1;

    for (let i = outputMatch + 7; i < output.length; i++) {
      const char = output[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === "'" && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            dictEnd = i;
            break;
          }
        }
      }
    }

    if (dictEnd === -1) {
      return null;
    }

    const pythonDict = output.substring(outputMatch + 7, dictEnd + 1);

    // Convert Python syntax to JavaScript-compatible syntax
    // Then use Function constructor to safely evaluate
    const jsObjectStr = pythonDict
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      // Replace single quotes with double quotes for strings
      .replace(/'/g, '"');

    // Safely evaluate the object literal
    // We wrap in parentheses to ensure it's treated as an expression
    const parsed = (new Function(`return (${jsObjectStr})`))();

    // Verify it has required unified format fields
    if (parsed && typeof parsed === 'object' &&
        parsed.result_type && typeof parsed.success === 'boolean') {
      return parsed;
    }

    return null;
  } catch {
    // If parsing fails, return null - output is not in unified format
    return null;
  }
}

/**
 * Result Logger handler.
 *
 * Logs agent execution results to console and optionally to file/database.
 * Handles both agent.task.completed and agent.task.failed events.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: z.infer<typeof inputSchema>, { logger, state }: any) => {
  const timestamp = new Date().toISOString();

  // Determine if this is a completed or failed event
  const isFailedEvent = !input.result && input.error;

  // Normalize data structure
  const normalizedResult = isFailedEvent
    ? {
        // Failed event: extract from direct fields
        success: false,
        error: input.error,
        output: input.stack,
        executionTime: undefined,
        metadata: undefined,
      }
    : (input.result || {
        // Fallback for completed event without result
        success: true,
        output: undefined,
        error: undefined,
        executionTime: undefined,
        metadata: undefined,
      }); // Completed event: use nested result

  const taskId = input.taskId;
  const task = input.task || 'Unknown task';
  const sessionId = input.sessionId;

  // Parse unified format result from output
  const structuredResult = parseUnifiedResult(normalizedResult.output);

  logger.info(isFailedEvent ? '=== Agent Task Failed ===' : '=== Agent Task Completed ===', {
    taskId,
    task,
    success: normalizedResult.success,
    sessionId,
    timestamp,
    executionTime: normalizedResult.executionTime,
    metadata: normalizedResult.metadata,
    ...(structuredResult && {
      unifiedFormat: true,
      resultType: structuredResult.result_type,
    }),
  });

  if (normalizedResult.success) {
    logger.info('✅ Task Execution Successful', {
      output: normalizedResult.output?.substring(0, 200) + ((normalizedResult.output?.length ?? 0) > 200 ? '...' : ''),
      llmCalls: normalizedResult.metadata?.llmCalls,
      skillCalls: normalizedResult.metadata?.skillCalls,
      totalTokens: normalizedResult.metadata?.totalTokens,
    });
  } else {
    logger.warn('❌ Task Execution Failed', {
      task,
      sessionId,
      error: normalizedResult.error,
      stderr: normalizedResult.output?.substring(0, 500),
    });
  }

  // Store execution history in state with size limits and circular reference protection
  try {
    // Use Motia state API with groupId and key
    const groupId = 'agent:execution';
    const key = 'history';

    // Get existing history with circular reference check
    const existingHistoryRaw = await state.get(groupId, key);

    // Use safe clone to prevent circular reference issues
    let history: any[];
    if (existingHistoryRaw && Array.isArray(existingHistoryRaw)) {
      const cloned = safeClone(existingHistoryRaw);
      history = cloned || []; // Fallback to empty array if clone fails
    } else {
      history = [];
    }

    // Check for circular references in existing history
    if (hasCircularReference(history)) {
      logger.warn('[result-logger] Circular reference detected in existing history, resetting', {
        historyLength: history.length
      });
      history = [];
    }

    // Remove any existing entry with the same taskId to prevent duplicates
    const duplicateIndex = history.findIndex((entry: any) => entry.taskId === taskId);
    if (duplicateIndex !== -1) {
      history.splice(duplicateIndex, 1);
      logger.info('Removed duplicate task entry', { taskId });
    }

    // Create simplified entry to prevent complex nested structures
    const newEntry = simplifyHistoryEntry({
      taskId,
      timestamp,
      task,
      success: normalizedResult.success,
      output: normalizedResult.output,
      error: normalizedResult.error,
      executionTime: normalizedResult.executionTime,
      sessionId,
      metadata: normalizedResult.metadata, // 添加metadata字段
    });

    // Add new entry at the beginning
    history.unshift(newEntry);

    // Keep only last MAX_HISTORY_SIZE entries (reduced from 100 to 20)
    if (history.length > MAX_HISTORY_SIZE) {
      const removed = history.splice(MAX_HISTORY_SIZE);
      logger.debug('Trimmed history entries', { removedCount: removed.length });
    }

    // Final circular reference check before saving
    if (hasCircularReference(history)) {
      logger.error('[result-logger] Circular reference detected after modification, not saving to state');
      throw new Error('Circular reference in history data');
    }

    // Save back to state using safeStateSet
    const success = await safeStateSet(state, groupId, key, history);

    if (!success) {
      logger.error('[result-logger] Failed to save history due to circular reference or other error');
      throw new Error('Failed to save history to state');
    }

    logger.info('Execution history updated', {
      totalEntries: history.length,
      maxSize: MAX_HISTORY_SIZE,
      taskId,
      removedDuplicate: duplicateIndex !== -1,
    });
  } catch (error: any) {
    logger.error('Failed to update execution history', {
      error: error.message,
      stack: error.stack
    });
    // Don't throw - continue execution even if state update fails
  }

  return {
    logged: true,
    timestamp,
    task,
  };
};
