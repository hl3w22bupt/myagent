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
 */
export const inputSchema = z.object({
  /**
   * Task that was executed.
   */
  task: z.string(),

  /**
   * Whether execution succeeded.
   */
  success: z.boolean(),

  /**
   * Output from agent execution.
   */
  output: z.string().optional(),

  /**
   * Execution metadata.
   */
  metadata: z.object({
    llmCalls: z.number(),
    skillCalls: z.number(),
    totalTokens: z.number()
  }).optional(),

  /**
   * Session ID if multi-turn conversation.
   */
  sessionId: z.string().optional()
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

  logger.info('=== Agent Task Completed ===', {
    task: input.task,
    success: input.success,
    sessionId: input.sessionId,
    timestamp,
    metadata: input.metadata
  });

  if (input.success) {
    logger.info('✅ Task Execution Successful', {
      output: input.output?.substring(0, 200) + (input.output?.length > 200 ? '...' : ''),
      llmCalls: input.metadata?.llmCalls,
      skillCalls: input.metadata?.skillCalls,
      totalTokens: input.metadata?.totalTokens
    });
  } else {
    logger.warn('❌ Task Execution Failed', {
      task: input.task,
      sessionId: input.sessionId
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
      success: input.success,
      output: input.output,
      metadata: input.metadata,
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
