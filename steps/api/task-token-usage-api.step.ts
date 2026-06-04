/**
 * Task Token Usage API Step.
 *
 * API endpoint for fetching token usage statistics for a specific task.
 * Returns summary, breakdown, and timeline data.
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store.js';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage.js';

/**
 * Task Token Usage API configuration.
 */
export const config = {
  name: 'task-token-usage-api',
  description: 'API endpoint for fetching token usage for a specific task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:taskId/token-usage' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for task token usage requests.
 */
const _taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Task Token Usage API handler.
 */
export const handler: any = async (context: any) => {
  const taskId = context.request.pathParams.taskId;

  logger.info('Task Token Usage API: Received request', { taskId });

  try {
    // Get database connection
    const dataStore = getDataStore();
    const pool = 'getPool' in dataStore && typeof dataStore.getPool === 'function'
      ? dataStore.getPool()
      : null;

    if (!pool) {
      logger.error('Task Token Usage API: Pool not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Database connection not available',
        },
      };
    }

    const storage = new PostgresTokenUsageStorage(pool);

    // Get task usage summary from database
    const taskUsage = await storage.getTaskUsage(taskId);

    if (!taskUsage) {
      logger.info('Task Token Usage API: Task not found in database', { taskId });
      return {
        status: 404,
        body: {
          success: false,
          message: 'Task not found or no token usage recorded yet. Token tracking may be in progress.',
        },
      };
    }

    // Get detailed timeline and breakdown from database
    try {
      const { timeline, bySkill, byModel } = await storage.getTaskTimeline(taskId);

      logger.info('Task Token Usage API: Retrieved detailed data from database', {
        taskId,
        timelineCount: timeline.length,
        skillsCount: bySkill.length,
        modelsCount: byModel.length,
      });

      return {
        status: 200,
        body: {
          success: true,
          taskId,
          summary: taskUsage,
          breakdown: { bySkill, byModel },
          timeline,
        },
      };
    } catch (traceError: any) {
      logger.warn('Task Token Usage API: Failed to fetch timeline from database', {
        taskId,
        error: traceError.message,
      });

      // Return database data even if traces fail
      return {
        status: 200,
        body: {
          success: true,
          taskId,
          summary: taskUsage,
          breakdown: {
            bySkill: [],
            byModel: [],
          },
          timeline: [],
        },
      };
    }
  } catch (error: any) {
    logger.error('Task Token Usage API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch task token usage',
        error: error.message,
      },
    };
  }
};
