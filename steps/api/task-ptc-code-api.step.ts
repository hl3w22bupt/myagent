/**
 * PTC Code API Step.
 *
 * REST API endpoint for retrieving PTC (Programmatic Tool Calling) generated code.
 * Returns the PTC code records for a given task, including selected skills and reasoning.
 */

import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

// Initialize data store at module level (same pattern as context-api)
const unifiedStore = getDataStore();

/**
 * Query parameters schema for PTC Code API.
 */
export const queryParamsSchema = z
  .object({
    taskId: z.string().describe('Task ID to retrieve PTC codes for'),
  })
  .passthrough();

/**
 * PTC Code API Step configuration.
 */
export const config = {
  name: 'task-ptc-code-api',
  description: 'REST API endpoint for retrieving PTC generated code',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:taskId/ptc-code' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * PTC Code API handler.
 *
 * Retrieves PTC code records for a given task from the database.
 * Returns all PTC code generations including the final code for each round.
 */
export const handler = async (context: any) => {
  const taskId = context.request.pathParams?.taskId || context.request?.params?.taskId || context.request?.query?.taskId;

  if (!taskId) {
    logger.warn('PTC Code API: Missing taskId parameter');

    return {
      status: 400,
      body: {
        success: false,
        message: 'taskId parameter is required',
      },
    };
  }

  logger.info('PTC Code API: Received request', { taskId });

  try {
    // Use module-level dataStore (same pattern as context-api)
    const dataStore = unifiedStore;

    // Get task from database
    const task = await dataStore.getTask(taskId);

    if (!task) {
      logger.warn('PTC Code API: Task not found', { taskId });

      return {
        status: 404,
        body: {
          success: false,
          message: 'Task not found',
        },
      };
    }

    // Get PTC codes from task
    const ptcCodes = task.ptcCodes || [];

    logger.info('PTC Code API: Retrieved PTC codes', {
      taskId,
      count: ptcCodes.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: ptcCodes,
      },
    };
  } catch (error: any) {
    logger.error('PTC Code API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve PTC codes',
        error: error.message,
      },
    };
  }
};
