/**
 * Soul Agent Demo Chat API
 *
 * 提供 HTTP API 接口来演示 Soul Agent 的使用
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { ApiRouteConfig } from 'motia';

/**
 * Soul Agent Chat API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'soul-demo-chat',
  description: 'Soul Agent 演示聊天接口',

  path: '/api/demo/soul/chat',
  method: 'POST',

  emits: [],
  flows: [],
};

/**
 * Soul Agent Chat handler.
 */
export const handler = async (request: any, { logger }: any) => {
  const startTime = Date.now();

  try {
    const { soulId, userId, message } = request.body;

    if (!soulId || !userId || !message) {
      logger.error('Missing required fields');

      return {
        status: 400,
        body: {
          error: 'Missing required fields: soulId, userId, message'
        }
      };
    }

    const sessionId = `soul-${soulId}-${userId}`;

    logger.info('Soul Agent chat request', {
      sessionId,
      soulId,
      userId,
      message: message.substring(0, 50)
    });

    // 1. 激活 Soul Agent
    const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

    // 2. 添加用户消息到对话历史
    // Note: Soul Agent now saves to task_contexts automatically via execute()
    // await soulContextDataService.addConversationMessage(sessionId, 'user', message);

    // 3. 执行 Soul Agent
    const result = await soulAgent.execute({
      trigger_time: new Date().toISOString(),
      context: {
        source: 'api',
        data: {
          type: 'user_message',
          message: {
            role: 'user',
            content: message,
            timestamp: Date.now()
          }
        }
      }
    });

    // 4. 获取最近的对话（包括 AI 的回复）
    // Note: Use Context API instead to fetch conversation history
    // const recentConversations = await soulContextDataService.getRecentConversations(sessionId, 5);
    const recentConversations = [];

    const executionTime = Date.now() - startTime;

    logger.info('Soul Agent chat completed', {
      sessionId,
      executionTime
    });

    return {
      status: 200,
      body: {
        success: true,
        sessionId,
        soulId,
        userId,
        executionTime,
        result: {
          message: '对话已处理',
          conversations: recentConversations,
          agentOutput: result
        }
      }
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;

    logger.error('Soul Agent chat error', {
      error: error.message,
      stack: error.stack,
      executionTime
    });

    return {
      status: 500,
      body: {
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
};
