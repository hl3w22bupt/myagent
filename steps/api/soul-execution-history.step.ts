/**
 * Soul Execution History API
 *
 * 获取 Soul Agent 的执行历史记录
 */

import { z } from 'zod';
import { soulExecutionHistoryService } from '../../src/core/database/soul-data-service';

/**
 * Soul Execution History API configuration.
 */
export const config: any = {
  type: 'api',
  name: 'soul-execution-history',
  description: '获取 Soul Agent 执行历史记录',
  path: '/api/soul/:soulId/execution-history',
  method: 'GET',
  emits: [],
  flows: [],
};

/**
 * Request schema
 */
const requestSchema = z.object({
  limit: z.coerce.number().optional().default(20),
  offset: z.coerce.number().optional().default(0),
  status: z.enum(['running', 'completed', 'failed', 'hibernated']).optional(),
  sessionId: z.string().optional(),
});

export type RequestSchema = z.infer<typeof requestSchema>;

/**
 * Soul Execution History handler.
 */
export const handler = async (request: any, { logger }: any) => {
  const soulId = request.pathParams?.soulId || request.params?.soulId;
  const query = request.query || {};

  logger.info('Fetching soul execution history', { soulId, query });

  try {
    // Validate and parse query parameters
    const validatedQuery = requestSchema.parse(query);

    logger.info('Validated query parameters', {
      soulId,
      sessionId: validatedQuery.sessionId,
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
      status: validatedQuery.status
    });

    // Build query object
    const historyQuery: any = {
      soulId,
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
    };

    if (validatedQuery.status) {
      historyQuery.status = validatedQuery.status;
    }

    if (validatedQuery.sessionId) {
      historyQuery.sessionId = validatedQuery.sessionId;
    }

    logger.info('Database query', { historyQuery });

    // Get execution history
    const history = await soulExecutionHistoryService.getExecutionHistory(historyQuery);

    logger.info('Soul execution history fetched successfully', {
      soulId,
      sessionId: validatedQuery.sessionId,
      count: history.length,
      firstSessionId: history[0]?.sessionId
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          soulId,
          history,
          pagination: {
            limit: validatedQuery.limit,
            offset: validatedQuery.offset,
            total: history.length
          }
        }
      }
    };

  } catch (error: any) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        }
      };
    }

    logger.error('Failed to fetch soul execution history', {
      soulId,
      error: error.message,
      stack: error.stack
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};
