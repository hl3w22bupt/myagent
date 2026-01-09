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
 * Note: master-agent sends nested structure with result wrapper.
 */
export const inputSchema = z.object({
  /**
   * Task that was executed.
   */
  task: z.string(),

  /**
   * Session ID.
   */
  sessionId: z.string().optional(),

  /**
   * Nested result object from Agent execution.
   */
  result: z.object({
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
    state: z.object({
      conversationLength: z.number().optional(),
      executionCount: z.number().optional(),
      variablesCount: z.number().optional()
    }).optional(),

    /**
     * Execution metadata.
     */
    metadata: z.object({
      llmCalls: z.number(),
      skillCalls: z.number(),
      totalTokens: z.number()
    }).optional()
  })
});

/**
 * Result Logger Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'result-logger',
  description: 'Logs agent task execution results for audit trail',

  /**
   * Subscribe to agent task completion events.
   */
  subscribes: ['agent.task.completed'],

  /**
   * Optionally emit analytics events.
   */
  emits: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow']
};

/**
 * Result Logger handler.
 *
 * Logs agent execution results to console and optionally to file/database.
 */
export const handler = async (
  input: z.infer<typeof inputSchema>,
  { logger, state }: any
) => {
  const timestamp = new Date().toISOString();
  const { result } = input;

  logger.info('=== Agent Task Completed ===', {
    task: input.task,
    success: result.success,
    sessionId: input.sessionId,
    timestamp,
    executionTime: result.executionTime,
    metadata: result.metadata
  });

  if (result.success) {
    logger.info('✅ Task Execution Successful', {
      output: result.output?.substring(0, 200) + (result.output?.length > 200 ? '...' : ''),
      llmCalls: result.metadata?.llmCalls,
      skillCalls: result.metadata?.skillCalls,
      totalTokens: result.metadata?.totalTokens
    });
  } else {
    logger.warn('❌ Task Execution Failed', {
      task: input.task,
      sessionId: input.sessionId,
      error: result.error,
      stderr: result.output?.substring(0, 500)
    });
  }

  // Store execution history in state (last 100 executions)
  try {
    const historyKey = 'agent:execution:history';
    const history = await state.get(historyKey) || [];

    // Add new entry
    history.unshift({
      timestamp,
      task: input.task,
      success: result.success,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      metadata: result.metadata,
      sessionId: input.sessionId
    });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.pop();
    }

    await state.set(historyKey, history);

    logger.info('Execution history updated', {
      totalEntries: history.length
    });
  } catch (error: any) {
    logger.warn('Failed to update execution history', {
      error: error.message
    });
  }

  return {
    logged: true,
    timestamp,
    task: input.task
  };
};
