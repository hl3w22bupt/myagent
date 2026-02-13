/**
 * Output History Tracker Step.
 *
 * Tracks output history for multi-turn conversations.
 * Each execution round's output is saved to a separate outputs table (similar to artifacts).
 * This design avoids race conditions and concurrent update issues.
 */

import { z } from 'zod';
import { EventConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Input schema for output history tracker.
 */
export const inputSchema = z.object({
  taskId: z.string(),
  sessionId: z.string().optional(),
  task: z.string().optional(),
  result: z.object({
    success: z.boolean(),
    output: z.string().optional(),
    error: z.string().optional(),
    executionTime: z.number().optional(),
    state: z.any().optional(),
    metadata: z.any().optional(),
  }).optional(),
  error: z.string().optional(),
  stack: z.string().optional(),
}).passthrough();

/**
 * Output History Tracker configuration.
 *
 * NOTE: This step subscribes to agent.task.completed BEFORE result-logger.
 * The Motia framework executes steps in registration order, so this step
 * should be registered before result-logger to ensure output history is
 * saved before result-logger updates the task metadata.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'output-history-tracker',
  description: 'Tracks output history for multi-turn conversations',

  subscribes: ['agent.task.completed'],

  emits: [],

  flows: ['agent-workflow'],
};

/**
 * Output History Tracker handler.
 *
 * Saves each execution round's output to task metadata for multi-turn conversations.
 * This allows users to view all generated outputs across conversation rounds.
 */
export const handler = async (input: z.infer<typeof inputSchema>, { logger }: any) => {
  const { taskId, sessionId, result } = input;

  logger.info('[Output History Tracker] Received event', {
    taskId,
    sessionId,
    hasResult: !!result,
    hasOutput: !!(result?.output),
  });

  if (!result || !result.output) {
    logger.debug('[Output History Tracker] No output to save', { taskId });
    return { tracked: false };
  }

  try {
    const store = getDataStore();
    const task = await store.getTask(taskId);

    if (!task) {
      logger.warn('[Output History Tracker] Task not found', { taskId });
      return { tracked: false, error: 'Task not found' };
    }

    // Get existing outputs to determine round number
    const existingOutputs = await store.getOutputs(taskId);
    const round = existingOutputs.length + 1;

    logger.info('[Output History Tracker] Saving output', {
      taskId,
      sessionId: sessionId || task.sessionId,
      round,
      existingOutputsCount: existingOutputs.length,
      outputLength: result.output?.length || 0,
    });

    // Add current output to outputs table (append, not overwrite)
    await store.addOutput({
      taskId,
      sessionId: sessionId || task.sessionId,
      round,
      output: result.output,
      executionTime: result.executionTime,
      timestamp: new Date(),
    });

    logger.info('[Output History Tracker] Output saved successfully', {
      taskId,
      round,
      outputLength: result.output.length,
    });

    return {
      tracked: true,
      round,
    };
  } catch (error: any) {
    logger.error('[Output History Tracker] Failed to save output', {
      taskId,
      error: error.message,
      stack: error.stack,
    });

    return {
      tracked: false,
      error: error.message,
    };
  }
};
