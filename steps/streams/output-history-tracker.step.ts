/**
 * Output History Tracker Step.
 *
 * Tracks output history for multi-turn conversations.
 * Each execution round's output is saved to allow users to view all generated files.
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
  const { taskId, result } = input;

  if (!result || !result.output) {
    logger.debug('No output to save', { taskId });
    return { tracked: false };
  }

  try {
    const store = getDataStore();
    const task = await store.getTask(taskId);

    if (!task) {
      logger.warn('Task not found for output history tracking', { taskId });
      return { tracked: false, error: 'Task not found' };
    }

    // Initialize output history if not exists
    const metadata = task.metadata || {};
    const outputHistory = metadata.outputHistory || [];

    // Add current output to history
    outputHistory.push({
      round: outputHistory.length + 1,
      output: result.output,
      timestamp: new Date().toISOString(),
      executionTime: result.executionTime,
    });

    // Update task metadata with output history
    await store.updateTask(taskId, {
      metadata: {
        ...metadata,
        outputHistory,
      },
    });

    logger.info('Output history saved', {
      taskId,
      round: outputHistory.length,
      outputLength: result.output.length,
    });

    return {
      tracked: true,
      round: outputHistory.length,
    };
  } catch (error: any) {
    logger.error('Failed to save output history', {
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
