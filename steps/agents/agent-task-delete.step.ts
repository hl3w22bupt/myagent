/**
 * Agent Task Delete API Step.
 *
 * REST API endpoint for deleting a specific agent task execution result.
 * Accepts HTTP requests and removes a task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getTaskStore } from '../../src/core/database/task-store';

/**
 * Query parameters schema for delete API.
 */
export const querySchema = z.object({
  /**
   * Task ID to delete (required).
   */
  id: z.string().min(1, 'Task ID is required').describe('Task ID to delete'),
});

/**
 * Agent Task Delete API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-task-delete-api',
  description: 'REST API endpoint for deleting a specific agent task result',

  /**
   * API route configuration.
   */
  path: '/agent/result',
  method: 'DELETE',

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
 * Agent Task Delete API handler.
 *
 * Deletes a task result from database based on task ID.
 */
export const handler = async (request: any, { logger }: any) => {
  // Parse query parameters
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

  logger.info('Agent Task Delete API: Received delete request', { taskId: id });

  try {
    // Query from database first to get task info
    const taskStore = getTaskStore();
    const task = await taskStore.get(id);

    if (!task) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    // Delete from database
    await taskStore.delete(id);

    logger.info('Agent Task Delete API: Task deleted successfully', { taskId: id });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Task deleted successfully',
        taskId: id,
        deletedTask: {
          taskId: task.id,
          task: task.task,
          success: task.status === 'completed',
          timestamp: task.createdAt.toISOString(),
        },
      },
    };
  } catch (error: any) {
    logger.error('Agent Task Delete API: Error deleting task', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to delete task',
        error: error.message,
      },
    };
  }
};
