/**
 * Get Stream History API Step configuration.
 */

import { type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { taskExecutionStream } from '../streams/task-execution.stream';

/**
 * Get Stream History API Step configuration.
 */
export const config = {
  name: 'stream-history-api',
  description: 'API endpoint for fetching stream history for a task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:id/stream-history' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for stream history requests.
 */
const _taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Stream History handler.
 */
export const handler: any = async (context: any) => {
  const taskId = context.request.pathParams.id;

  logger.info('Stream History API: Received request', { taskId });

  try {
    // Get all stream data for this task
    const streamData = await taskExecutionStream.list(taskId);

    logger.info('Stream History API: Retrieved data', {
      taskId,
      dataCount: Array.isArray(streamData) ? streamData.length : 0,
    });

    return {
      status: 200,
      body: {
        success: true,
        taskId,
        data: Array.isArray(streamData) ? streamData : [streamData],
      },
    };
  } catch (error: any) {
    logger.error('Stream History API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch stream history',
        error: error.message,
      },
    };
  }
};
