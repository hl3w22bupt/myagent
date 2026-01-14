/**
 * Agent Result Logger Step.
 *
 * Listens to agent task completion events and logs results.
 * Provides audit trail and execution history.
 */

import { z } from 'zod';
import { EventConfig } from 'motia';

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
 * Result Logger handler.
 *
 * Logs agent execution results to console and optionally to file/database.
 * Handles both agent.task.completed and agent.task.failed events.
 */
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

  logger.info(isFailedEvent ? '=== Agent Task Failed ===' : '=== Agent Task Completed ===', {
    taskId,
    task,
    success: normalizedResult.success,
    sessionId,
    timestamp,
    executionTime: normalizedResult.executionTime,
    metadata: normalizedResult.metadata,
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

  // Store execution history in state (last 100 executions)
  try {
    // Use Motia state API with groupId and key
    const groupId = 'agent:execution';
    const key = 'history';

    // Get existing history or initialize empty array
    const existingHistory = await state.get(groupId, key);
    const history = existingHistory || [];

    // Add new entry with normalized structure
    history.unshift({
      taskId,
      timestamp,
      task,
      success: normalizedResult.success,
      output: normalizedResult.output,
      error: normalizedResult.error,
      executionTime: normalizedResult.executionTime,
      metadata: normalizedResult.metadata,
      sessionId,
    });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.pop();
    }

    // Save back to state
    await state.set(groupId, key, history);

    logger.info('Execution history updated', {
      totalEntries: history.length,
    });
  } catch (error: any) {
    logger.warn('Failed to update execution history', {
      error: error.message,
      stack: error.stack,
    });
  }

  return {
    logged: true,
    timestamp,
    task,
  };
};
