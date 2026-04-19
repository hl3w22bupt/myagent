/**
 * Token Usage API Step.
 *
 * API endpoints for fetching token usage statistics.
 * Provides task-level, global summary, and trend analytics.
 */

import { type StepConfig, logger } from 'motia';
import { z as _z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage';
import type { TimeRange } from '../token-usage/types';

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
export const config = {
  name: 'token-usage-api',
  description: 'API endpoints for token usage statistics and analytics',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/token-usage/:action' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

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
  context: any
) => {
  const { action, taskId, timeRange = '30d' } = {
    ...context.request?.pathParams,
    ...context.request?.queryParams,
    ...context.request?.params,
    ...context.request?.query,
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

  const trends = await storage.getUsageTrends(startDate, endDate, granularity);

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
