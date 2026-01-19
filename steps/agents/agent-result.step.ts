/**
 * Agent Result API Step.
 *
 * REST API endpoint for querying a single agent task execution result.
 * Accepts HTTP requests and returns a specific task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { safeStateGet } from '../../src/utils/state-safety';

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
    const groupId = 'agent:execution';
    const key = 'history';

    // 使用safeStateGet获取历史数据，防止circular reference问题
    let history = await safeStateGet(state, groupId, key, []);

    // 🔧 修复损坏的 state 数据：如果 history 是对象而不是数组，提取其中的数组
    if (!Array.isArray(history) && typeof history === 'object' && history !== null) {
      logger.warn('[agent-result] Detected corrupted history data (object instead of array), attempting repair...');

      // 如果是旧的错误格式 { found, taskIndex, deletedTask, history: [...] }
      if ('history' in history && Array.isArray((history as any).history)) {
        logger.warn('[agent-result] Found old buggy format, extracting history array');
        history = (history as any).history;

        // 立即修复 state
        await state.set(groupId, key, history);
        logger.warn('[agent-result] State repaired successfully');
      } else {
        // 完全无法修复的数据，重置为空数组
        logger.error('[agent-result] Corrupted data cannot be repaired, resetting to empty array');
        history = [];
        await state.set(groupId, key, history);
      }
    }

    // 确保现在是数组
    if (!Array.isArray(history)) {
      logger.error('[agent-result] Failed to repair history, resetting to empty array');
      history = [];
      await state.set(groupId, key, history);
    }

    // 查找特定任务
    const foundResult = history.find((r: any) => r.taskId === id);

    if (!foundResult) {
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
          taskId: foundResult.taskId,
          task: foundResult.task,
          success: foundResult.success,
          output: foundResult.output,
          error: foundResult.error,
          executionTime: foundResult.executionTime,
          metadata: foundResult.metadata,
          sessionId: foundResult.sessionId,
          timestamp: foundResult.timestamp,
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
