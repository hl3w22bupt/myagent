import type { ApiRouteConfig } from 'motia';
import { z as _z } from 'zod';

/**
 * Get Stream History API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'stream-history-api',
  description: 'API endpoint for fetching stream history for a task',

  /**
   * API route configuration.
   */
  path: '/api/tasks/:id/stream-history',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Input schema for stream history requests.
 */
export const inputSchema = _z.object({
  /**
   * The task ID to fetch stream history for.
   */
  id: _z.string(),
});

/**
 * Stream History handler.
 */
export const handler = async (
  input: any,
  { logger, streams }: any
) => {
  const { id: taskId } = input.pathParams;

  logger.info('Stream History API: Received request', { taskId });

  try {
    if (!streams || !streams.taskExecution) {
      logger.error('Stream History API: Streams not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Streams not available',
        },
      };
    }

    // 获取stream的所有数据 - 使用 getGroup 方法
    const streamData = await streams.taskExecution.getGroup(taskId);

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
