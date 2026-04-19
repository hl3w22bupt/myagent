/**
 * Execution Traces API Step.
 *
 * API endpoints for fetching execution traces for a task.
 * Returns flat trace array with filtering handled on the frontend.
 */

import { type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { executionTracesStream } from '../streams/execution-traces.stream';

/**
 * Get Execution Traces API Step configuration.
 */
export const config = {
  name: 'execution-traces-api',
  description: 'API endpoint for fetching execution traces for a task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:id/traces' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for execution traces requests.
 */
const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Execution Traces handler.
 */
export const handler: any = async (context: any) => {
  const taskId = context.request.pathParams.id;

  logger.info('Execution Traces API: Received request', { taskId });

  try {
    // Get all trace entries for this task
    const traceData = await executionTracesStream.list(taskId);

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
