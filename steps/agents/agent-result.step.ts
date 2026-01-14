/**
 * Agent Result API Step.
 *
 * REST API endpoint for querying a single agent task execution result.
 * Accepts HTTP requests and returns a specific task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Query parameters schema for single result API.
 */
export const querySchema = z.object({
  /**
   * Task ID to query (required).
   */
  id: z.string().min(1, 'Task ID is required').describe('Task ID to query specific result'),
});

/**
 * Agent Result API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-result-api',
  description: 'REST API endpoint for querying a single agent task result',

  /**
   * API route configuration.
   */
  path: '/agent/result',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Agent Result API handler.
 *
 * Retrieves a single task result from state based on task ID.
 */
export const handler = async (request: any, { logger, state }: any) => {
  // Parse query parameters - use queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    return {
      status: 400,
      body: {
        success: false,
        message: `Invalid query parameters: ${validationResult.error.message}`,
      },
    };
  }

  const { id } = validationResult.data;

  logger.info('Agent Result API: Received query request', { taskId: id });

  try {
    // Retrieve execution history from state
    const groupId = 'agent:execution';
    const key = 'history';
    const history = (await state.get(groupId, key)) || [];

    // Find the specific task
    const result = history.find((r: any) => r.taskId === id);

    if (!result) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    // Return single result
    return {
      status: 200,
      body: {
        success: true,
        result: {
          taskId: result.taskId,
          task: result.task,
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime,
          metadata: result.metadata,
          sessionId: result.sessionId,
          timestamp: result.timestamp,
        },
      },
    };
  } catch (error: any) {
    logger.error('Agent Result API: Error retrieving result', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve task result',
        error: error.message,
      },
    };
  }
};
