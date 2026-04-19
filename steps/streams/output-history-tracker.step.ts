/**
 * Output History Tracker Step.
 *
 * Tracks output history for multi-turn conversations.
 * Each execution round's output is saved to a separate outputs table (similar to artifacts).
 * This design avoids race conditions and concurrent update issues.
 */

import { z } from 'zod';
import { type StepConfig, logger, queue } from 'motia';
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
 * NOTE: This step has been merged into task-result-handler.
 * iii engine uses competing consumers for queue topics (only one subscriber
 * receives the message), so we merged this into task-result-handler to ensure
 * both output tracking and task status update happen in a single handler.
 *
 * This file is kept for reference but no longer subscribes to any triggers.
 */
export const config = {
  name: 'output-history-tracker',
  description: 'DEPRECATED: Merged into task-result-handler',

  triggers: [] as any[],
  enqueues: [] as const,
} as const;

/**
 * Output History Tracker handler.
 *
 * Saves each execution round's output to task metadata for multi-turn conversations.
 * This allows users to view all generated outputs across conversation rounds.
 */
export const handler = async (input: z.infer<typeof inputSchema>) => {
  const { taskId, sessionId, result, messageId } = input;

  logger.info('[Output History Tracker] Received event', {
    taskId,
    sessionId,
    messageId: messageId || 'NOT PROVIDED',
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
      messageId,  // Message ID for tracking
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
