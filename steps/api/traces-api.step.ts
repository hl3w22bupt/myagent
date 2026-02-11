/**
 * Execution Traces API Step.
 *
 * API endpoints for fetching execution traces for a task.
 * Returns flat trace array with filtering handled on the frontend.
 */

import type { ApiRouteConfig } from 'motia';
import { z as _z } from 'zod';

/**
 * Get Execution Traces API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'execution-traces-api',
  description: 'API endpoint for fetching execution traces for a task',

  /**
   * API route configuration.
   */
  path: '/api/tasks/:id/traces',
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
 * Input schema for execution traces requests.
 */
export const inputSchema = _z.object({
  /**
   * The task ID to fetch execution traces for.
   */
  id: _z.string(),
});

/**
 * Execution Traces handler.
 */
export const handler = async (
  input: any,
  { logger, streams }: any
) => {
  const { id: taskId } = input.pathParams;

  logger.info('Execution Traces API: Received request', { taskId });

  try {
    if (!streams || !streams.executionTraces) {
      logger.error('Execution Traces API: Streams not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Streams not available',
        },
      };
    }

    // Get all trace entries for this task
    const traceData = await streams.executionTraces.getGroup(taskId);

    // Ensure traces is an array
    const traces = Array.isArray(traceData) ? traceData : [traceData];

    logger.info('Execution Traces API: Retrieved data', {
      taskId,
      dataCount: traces.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        taskId,
        traces,
      },
    };
  } catch (error: any) {
    logger.error('Execution Traces API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch execution traces',
        error: error.message,
      },
    };
  }
};
