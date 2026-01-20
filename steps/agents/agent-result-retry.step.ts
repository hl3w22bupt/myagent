/**
 * Agent Retry API Step.
 *
 * REST API endpoint for manually retrying a failed agent task.
 * Accepts HTTP POST requests and re-executes a task with the same parameters.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getTaskStore } from '../../src/core/database/task-store';

/**
 * Query parameters schema for retry API.
 */
export const querySchema = z.object({
  /**
   * Task ID to retry (required).
   */
  id: z.string().min(1, 'Task ID is required').describe('Task ID to retry'),
});

/**
 * Agent Retry API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-retry-api',
  description: 'REST API endpoint for manually retrying a failed agent task',

  /**
   * API route configuration.
   */
  path: '/agent/result/retry',
  method: 'POST',

  /**
   * Emits task execution event.
   */
  emits: ['agent.task.execute'],

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
 * Agent Retry API handler.
 *
 * Retrieves a failed task and re-executes it.
 */
export const handler = async (request: any, { logger, emit }: any) => {
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

  logger.info('[Agent Retry] Received retry request', { taskId: id });

  try {
    // 从数据库查找要重试的任务
    const taskStore = getTaskStore();
    const foundTask = await taskStore.get(id);

    if (!foundTask) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    // 检查任务是否失败（只允许重试失败的任务）
    if (foundTask.status === 'completed') {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Cannot retry a successful task',
          taskId: id,
          taskStatus: foundTask.status,
        },
      };
    }

    logger.info('[Agent Retry] Re-executing failed task', {
      taskId: id,
      originalTask: foundTask.task,
      sessionId: foundTask.sessionId,
      status: foundTask.status,
    });

    // 重新执行任务（使用相同的 taskId）
    await emit({
      topic: 'agent.task.execute',
      data: {
        task: foundTask.task,
        sessionId: foundTask.sessionId,
        taskId: id, // 使用原始任务ID
        isRetry: true, // 标记为重试任务
      },
    });

    // 返回成功响应（异步执行）
    return {
      status: 202, // Accepted
      body: {
        success: true,
        message: 'Task retry initiated successfully',
        taskId: id,
        task: foundTask.task,
        sessionId: foundTask.sessionId,
        originalError: foundTask.error,
      },
    };
  } catch (error: any) {
    logger.error('[Agent Retry] Error initiating retry', {
      error: error.message,
      stack: error.stack,
      taskId: id,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to initiate task retry',
        error: error.message,
        taskId: id,
      },
    };
  }
};
