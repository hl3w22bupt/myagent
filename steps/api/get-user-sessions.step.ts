/**
 * Get User Sessions API Step
 *
 * 获取用户的所有会话列表
 * 用于 MyEcho 集成
 */

import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * 请求参数验证
 */
export const paramsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

/**
 * 查询参数验证
 */
const queryParamsSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
});

/**
 * API 配置
 */
export const config = {
  name: 'get-user-sessions',
  description: 'Get all sessions for a user',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/users/:userId/sessions' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * API Handler
 */
export const handler: any = async (context: any) => {
  try {
    // 获取路径参数
    const userId = context.request.pathParams?.userId;

    if (!userId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'User ID is required',
        },
      };
    }

    // 验证查询参数
    const { limit, offset } = queryParamsSchema.safeParse(context.request.queryParams).data || { limit: 50, offset: 0 };

    logger.info('Get User Sessions API: Fetching sessions', { userId, limit, offset });

    const store = getDataStore();
    await store.initialize();

    // 首先检查用户是否存在
    const user = await store.getUser(userId);
    if (!user) {
      logger.info('Get User Sessions API: User not found', { userId });
      return {
        status: 404,
        body: {
          success: false,
          error: 'User not found',
        },
      };
    }

    // 获取该用户的所有会话
    const sessions = await store.getUserSessions(userId);

    // 应用分页
    const paginatedSessions = sessions.slice(offset, offset + limit);

    return {
      status: 200,
      body: {
        success: true,
        data: {
          userId,
          sessions: paginatedSessions.map((s: any) => ({
            sessionId: s.sessionId,
            createdAt: s.createdAt.toISOString(),
            lastActiveAt: s.lastActiveAt.toISOString(),
            metadata: s.metadata,
          })),
          total: sessions.length,
          limit,
          offset,
        },
      },
    };
  } catch (error: any) {
    logger.error('Get User Sessions API: Error', {
      error: error.message,
      userId: context.request.pathParams?.userId,
    });

    if (error instanceof z.ZodError) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Validation failed',
          details: error.issues,
        },
      };
    }

    return {
      status: 500,
      body: {
        success: false,
        error: 'Internal server error',
        message: error.message,
      },
    };
  }
};
