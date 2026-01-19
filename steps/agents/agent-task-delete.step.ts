/**
 * Agent Task Delete API Step.
 *
 * REST API endpoint for deleting a specific agent task execution result.
 * Accepts HTTP requests and removes a task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { safeStateGet, safeStateSet } from '../../src/utils/state-safety';
import { stateLockManager } from '../../src/utils/state-lock';

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

    // ✅ 使用 atomicUpdate 保证原子性
    const result: any = await stateLockManager.atomicUpdate(
      state,
      groupId,
      key,
      (history: any) => {
        const current = history || [];

        if (!Array.isArray(current)) {
          throw new Error('Invalid history data structure');
        }

        // Find the task to delete
        const taskIndex = current.findIndex((r: any) => r.taskId === id);

        if (taskIndex === -1) {
          // 标记未找到
          return { found: false, taskIndex: -1, deletedTask: null, history: current };
        }

        // Remove the task from history
        const deletedTask = current[taskIndex];
        const newHistory = [
          ...current.slice(0, taskIndex),
          ...current.slice(taskIndex + 1)
        ];

        return { found: true, taskIndex, deletedTask, history: newHistory };
      }
    );

    // 检查是否找到任务
    if (!result.found) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    logger.info('Agent Task Delete API: Task deleted successfully', {
      taskId: id,
      remainingTasks: result.history.length
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Task deleted successfully',
        taskId: id,
        deletedTask: {
          taskId: result.deletedTask.taskId,
          task: result.deletedTask.task,
          success: result.deletedTask.success,
          timestamp: result.deletedTask.timestamp,
        },
        remainingTasks: result.history.length,
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
