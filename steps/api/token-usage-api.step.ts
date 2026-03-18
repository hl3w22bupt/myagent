/**
 * Token Usage API Step.
 *
 * API endpoints for fetching token usage statistics.
 * Provides task-level, global summary, and trend analytics.
 */

import type { ApiRouteConfig } from 'motia';
import { z as _z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage';
import type { TaskTokenUsage, TimeRange } from '../token-usage/types';

/**
 * Parse time range into start and end dates
 */
function parseTimeRange(timeRange: TimeRange): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (timeRange) {
    case '1h':
      startDate.setHours(startDate.getHours() - 1);
      break;
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      startDate.setHours(startDate.getHours() - 24);
  }

  return { startDate, endDate };
}

/**
 * Determine granularity based on time range
 */
function getGranularity(timeRange: TimeRange): 'hour' | 'day' {
  return timeRange === '1h' || timeRange === '24h' ? 'hour' : 'day';
}

/**
 * Token Usage API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'token-usage-api',
  description: 'API endpoints for token usage statistics and analytics',

  /**
   * Multiple route configurations handled via pathParams
   */
  path: '/api/token-usage/:action',
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
 * Input schema for token usage requests.
 */
export const inputSchema = _z.object({
  /**
   * Action determines which endpoint to execute
   */
  action: _z.enum(['summary', 'trends']),

  /**
   * Optional task ID for task-specific endpoint
   */
  taskId: _z.string().optional(),

  /**
   * Time range filter (for summary and trends)
   */
  timeRange: _z.enum(['1h', '24h', '7d', '30d']).optional(),
});

/**
 * Token Usage API handler.
 */
export const handler = async (
  input: any,
  { logger }: any
) => {
  const { action, taskId, timeRange = '24h' } = {
    ...input.pathParams,
    ...input.queryParams,
  };

  logger.info('Token Usage API: Received request', { action, taskId, timeRange });

  try {
    // Get database connection
    const dataStore = getDataStore();
    const pool = 'getPool' in dataStore && typeof dataStore.getPool === 'function'
      ? dataStore.getPool()
      : null;

    if (!pool) {
      logger.error('Token Usage API: Pool not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Database connection not available',
        },
      };
    }

    const storage = new PostgresTokenUsageStorage(pool);

    // Route to appropriate endpoint
    if (action === 'summary') {
      return await handleSummary(storage, timeRange, logger);
    } else if (action === 'trends') {
      return await handleTrends(storage, timeRange, logger);
    } else {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Invalid action',
        },
      };
    }
  } catch (error: any) {
    logger.error('Token Usage API: Error', {
      error: error.message,
      stack: error.stack,
      action,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch token usage',
        error: error.message,
      },
    };
  }
};

/**
 * Handle global summary endpoint
 */
async function handleSummary(
  storage: PostgresTokenUsageStorage,
  timeRange: TimeRange,
  logger: any
): Promise<any> {
  logger.info('Token Usage API: Fetching summary', { timeRange });

  const { startDate, endDate } = parseTimeRange(timeRange);

  const totalUsage = await storage.getTotalUsage(startDate, endDate);

  logger.info('Token Usage API: Summary retrieved', {
    timeRange,
    totalTokens: totalUsage.totalTokens,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: {
        timeRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ...totalUsage,
      },
    },
  };
}

/**
 * Handle trends endpoint
 */
async function handleTrends(
  storage: PostgresTokenUsageStorage,
  timeRange: TimeRange,
  logger: any
): Promise<any> {
  logger.info('Token Usage API: Fetching trends', { timeRange });

  const { startDate, endDate } = parseTimeRange(timeRange);
  const granularity = getGranularity(timeRange);

  // TODO: Implement getUsageTrends() in PostgresTokenUsageStorage
  // For now, return empty trends
  const trends: any[] = [];

  logger.info('Token Usage API: Trends retrieved', {
    timeRange,
    granularity,
    dataPoints: trends.length,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: {
        timeRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        trends,
      },
    },
  };
}

/**
 * Task-specific token usage endpoint.
 * This is a separate API route for fetching task-level usage.
 */

export const taskTokenUsageConfig: ApiRouteConfig = {
  type: 'api',
  name: 'task-token-usage-api',
  description: 'API endpoint for fetching token usage for a specific task',

  path: '/api/tasks/:taskId/token-usage',
  method: 'GET',

  emits: [],

  flows: ['agent-workflow'],
};

export const taskTokenUsageInputSchema = _z.object({
  taskId: _z.string(),
});

export const taskTokenUsageHandler = async (
  input: any,
  { logger, streams }: any
) => {
  const { taskId } = input.pathParams;

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

    // Get task usage summary
    const taskUsage = await storage.getTaskUsage(taskId);

    if (!taskUsage) {
      logger.info('Task Token Usage API: Task not found', { taskId });
      return {
        status: 404,
        body: {
          success: false,
          message: 'Task not found or no token usage recorded',
        },
      };
    }

    // Get detailed timeline from execution traces
    let detailedTimeline: any[] = [];
    if (streams && streams.executionTraces) {
      try {
        const traceData = await streams.executionTraces.getGroup(taskId);
        const traces = Array.isArray(traceData) ? traceData : [traceData];

        // Group by skill and model
        const groupedBySkill: Record<string, any> = {};
        const groupedByModel: Record<string, any> = {};

        traces.forEach((trace: any) => {
          if (trace.llmUsage) {
            // Group by skill
            const skill = trace.skillName || 'unknown';
            if (!groupedBySkill[skill]) {
              groupedBySkill[skill] = {
                skillName: skill,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                llmCallsCount: 0,
              };
            }
            groupedBySkill[skill].promptTokens += trace.llmUsage.promptTokens || 0;
            groupedBySkill[skill].completionTokens += trace.llmUsage.completionTokens || 0;
            groupedBySkill[skill].totalTokens += trace.llmUsage.totalTokens || 0;
            groupedBySkill[skill].llmCallsCount += 1;

            // Group by model
            const model = trace.llmUsage.model || 'unknown';
            if (!groupedByModel[model]) {
              groupedByModel[model] = {
                model: model,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                llmCallsCount: 0,
              };
            }
            groupedByModel[model].promptTokens += trace.llmUsage.promptTokens || 0;
            groupedByModel[model].completionTokens += trace.llmUsage.completionTokens || 0;
            groupedByModel[model].totalTokens += trace.llmUsage.totalTokens || 0;
            groupedByModel[model].llmCallsCount += 1;
          }
        });

        detailedTimeline = traces.map((trace: any) => ({
          timestamp: trace.timestamp,
          skillName: trace.skillName,
          agentId: trace.agentId,
          llmUsage: trace.llmUsage,
        }));

        logger.info('Task Token Usage API: Retrieved detailed data', {
          taskId,
          traceCount: traces.length,
          skillsCount: Object.keys(groupedBySkill).length,
          modelsCount: Object.keys(groupedByModel).length,
        });

        return {
          status: 200,
          body: {
            success: true,
            taskId,
            summary: taskUsage,
            breakdown: {
              bySkill: Object.values(groupedBySkill),
              byModel: Object.values(groupedByModel),
            },
            timeline: detailedTimeline,
          },
        };
      } catch (traceError: any) {
        logger.warn('Task Token Usage API: Failed to fetch traces', {
          taskId,
          error: traceError.message,
        });
      }
    }

    // Return without detailed timeline if streams unavailable
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
