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

    // 先读取当前 history 以找到要删除的任务
    let currentHistory: any[] = await safeStateGet(state, groupId, key, []);

    // 🔧 修复损坏的 state 数据：如果 history 是对象而不是数组，提取其中的数组
    if (!Array.isArray(currentHistory) && typeof currentHistory === 'object' && currentHistory !== null) {
      console.warn('[agent-task-delete] Detected corrupted history data (object instead of array), attempting repair...');

      // 如果是旧的错误格式 { found, taskIndex, deletedTask, history: [...] }
      if ('history' in currentHistory && Array.isArray(currentHistory.history)) {
        console.warn('[agent-task-delete] Found old buggy format, extracting history array');
        currentHistory = currentHistory.history;

        // 立即修复 state
        await safeStateSet(state, groupId, key, currentHistory);
        console.warn('[agent-task-delete] State repaired successfully');
      } else {
        // 完全无法修复的数据，重置为空数组
        console.error('[agent-task-delete] Corrupted data cannot be repaired, resetting to empty array');
        currentHistory = [];
        await safeStateSet(state, groupId, key, currentHistory);
      }
    }

    // 确保现在是数组
    if (!Array.isArray(currentHistory)) {
      console.error('[agent-task-delete] Failed to repair history, resetting to empty array');
      currentHistory = [];
      await safeStateSet(state, groupId, key, currentHistory);
    }

    // 检查任务是否存在
    const taskIndex = currentHistory.findIndex((r: any) => r.taskId === id);

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

    // 保存要删除的任务信息
    const deletedTask = currentHistory[taskIndex];

    // ✅ 使用 atomicUpdate 删除任务（只返回并存储数组）
    const newHistory: any[] = await stateLockManager.atomicUpdate(
      state,
      groupId,
      key,
      (history: any) => {
        const current = history || [];

        if (!Array.isArray(current)) {
          console.error('[agent-task-delete] Invalid history data structure, resetting to empty array');
          return [];
        }

        // Find the task to delete
        const index = current.findIndex((r: any) => r.taskId === id);

        if (index === -1) {
          // 任务已被其他请求删除，返回当前 history
          return current;
        }

        // 删除任务并返回新的 history 数组（不包含额外字段）
        return [
          ...current.slice(0, index),
          ...current.slice(index + 1)
        ];
      }
    );

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
