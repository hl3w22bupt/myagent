/**
 * Agent Task Delete API Step.
 *
 * REST API endpoint for deleting a specific agent task execution result.
 * Accepts HTTP requests and removes a task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { safeStateGet, safeStateSet } from '../../src/utils/state-safety';

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
 * Deletes a task result from state based on task ID.
 * Uses safeState utilities to prevent circular reference issues.
 */
export const handler = async (request: any, { logger, state }: any) => {
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
    const groupId = 'agent:execution';
    const key = 'history';

    // 使用 safeStateGet 获取当前历史记录，防止 circular reference 问题
    const history = await safeStateGet(state, groupId, key, []);

    if (!Array.isArray(history)) {
      return {
        status: 500,
        body: {
          success: false,
          message: 'Invalid history data structure',
        },
      };
    }

    // Find the task to delete
    const taskIndex = history.findIndex((r: any) => r.taskId === id);

    if (taskIndex === -1) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    // Remove the task from history
    const deletedTask = history[taskIndex];
    const newHistory = [
      ...history.slice(0, taskIndex),
      ...history.slice(taskIndex + 1)
    ];

    // 使用 safeStateSet 更新状态，防止 circular reference 问题
    const success = await safeStateSet(state, groupId, key, newHistory);

    if (!success) {
      logger.error('Agent Task Delete API: Failed to update state due to circular reference');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Failed to update state: circular reference detected',
        },
      };
    }

    logger.info('Agent Task Delete API: Task deleted successfully', {
      taskId: id,
      remainingTasks: newHistory.length
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Task deleted successfully',
        taskId: id,
        deletedTask: {
          taskId: deletedTask.taskId,
          task: deletedTask.task,
          success: deletedTask.success,
          timestamp: deletedTask.timestamp,
        },
        remainingTasks: newHistory.length,
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
