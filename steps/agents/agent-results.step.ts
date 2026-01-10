/**
 * Agent Results API Step.
 *
 * REST API endpoint for querying agent task execution results.
 * Accepts HTTP requests and returns task results from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Query parameters schema for results API.
 */
export const querySchema = z.object({
  /**
   * Task ID to query.
   */
  taskId: z.string().optional().describe('Task ID to query specific result'),

  /**
   * Session ID to filter results.
   */
  sessionId: z.string().optional().describe('Filter by session ID'),

  /**
   * Limit number of results.
   */
  limit: z.string().optional().describe('Limit number of results (default: 10)'),
});

/**
 * Agent Results API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-results-api',
  description: 'REST API endpoint for querying agent task results',

  /**
   * API route configuration.
   */
  path: '/agent/results',
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
 * Agent Results API handler.
 *
 * Retrieves task results from state based on query parameters.
 */
export const handler = async (request: any, { logger, state }: any) => {
  // Parse query parameters - use queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
  }

  const { taskId, sessionId, limit } = validationResult.data;
  const resultLimit = limit ? parseInt(limit, 10) : 10;

  logger.info('Agent Results API: Received query request', {
    taskId,
    sessionId,
    limit: resultLimit,
  });

  try {
    // Retrieve execution history from state
    const groupId = 'agent:execution';
    const key = 'history';
    const history = (await state.get(groupId, key)) || [];

    // Filter and process results
    let results = history;

    // Filter by taskId if provided
    if (taskId) {
      results = results.filter((r: any) => r.taskId === taskId);

      if (results.length === 0) {
        return {
          status: 404,
          body: {
            success: false,
            message: `Task with ID ${taskId} not found`,
            taskId,
          },
        };
      }

      // Return single result
      const result = results[0];
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
    }

    // Filter by sessionId if provided
    if (sessionId) {
      results = results.filter((r: any) => r.sessionId === sessionId);
    }

    // Apply limit
    results = results.slice(0, resultLimit);

    return {
      status: 200,
      body: {
        success: true,
        count: results.length,
        results: results.map((r: any) => ({
          taskId: r.taskId,
          task: r.task,
          success: r.success,
          output: r.output,
          error: r.error,
          executionTime: r.executionTime,
          metadata: r.metadata,
          sessionId: r.sessionId,
          timestamp: r.timestamp,
        })),
      },
    };
  } catch (error: any) {
    logger.error('Agent Results API: Error retrieving results', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve task results',
        error: error.message,
      },
    };
  }
};
