/**
 * Get User API Step
 *
 * 获取用户画像信息
 * 用于 MyEcho 集成
 */

import { z } from 'zod';
import type { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * 请求参数验证
 */
const paramsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

/**
 * API 配置
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'get-user',
  description: 'Get user profile and information',
  path: '/api/users/:userId',
  method: 'GET',
  emits: [],
};

/**
 * API Handler
 */
export const handler = async (request: any, { logger }: any) => {
  try {
    // 获取路径参数 (支持 pathParams 和 params 两种方式)
    const userId = request.pathParams?.userId || request.params?.userId;

    if (!userId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'User ID is required',
        },
      };
    }

    logger.info('Get User API: Fetching user', { userId });

    const store = getDataStore();
    await store.initialize();

    const user = await store.getUser(userId);

    if (!user) {
      logger.info('Get User API: User not found', { userId });
      return {
        status: 404,
        body: {
          success: false,
          error: 'User not found',
        },
      };
    }

    // 获取用户的所有会话
    const sessions = await store.getUserSessions(userId);

    return {
      status: 200,
      body: {
        success: true,
        data: {
          userId: user.userId,
          profile: user.profile,
          sessions: sessions.map((s: any) => s.sessionId),
          metadata: {
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            lastSessionId: user.lastSessionId,
          },
        },
      },
    };
  } catch (error: any) {
    logger.error('Get User API: Error', {
      error: error.message,
      userId: request.params?.userId,
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
