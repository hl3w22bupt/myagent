/**
 * Soul API - Execute Soul Trigger
 *
 * 简化版本：直接调用 Soul Agent，复用现有执行流程
 * - 自动推送 taskExecution stream（由 Agent.run() 处理）
 * - 自动推送 taskResult stream（由 Agent.run() 处理）
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { ApiRouteConfig } from 'motia';

/**
 * Soul Execute API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'soul-execute',
  description: 'Execute Soul Agent with trigger context',

  path: '/api/soul/:soulId/execute',
  method: 'POST',

  emits: [],
  flows: ['agent-workflow'],
};

/**
 * Soul Execute handler.
 */
export const handler = async (request: any, { logger, streams }: any) => {
  // Get soulId from path parameters (support both pathParams and params)
  const soulId = request.pathParams?.soulId || request.params?.soulId;
  const { userId, trigger_time, context: triggerContext } = request.body;

  if (!userId || !triggerContext) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing required fields: userId, context'
      }
    };
  }

  const sessionId = `soul-${soulId}-${userId}`;

  logger.info('Executing soul', {
    soulId,
    userId,
    sessionId,
    triggerSource: triggerContext.source
  });

  try {
    // 1. 激活 Soul Agent（获取或创建实例）
    const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

    // 2. 执行 Soul Agent
    // 内部会调用 Agent.run()，自动推送 stream
    const input = {
      trigger_time: trigger_time || new Date().toISOString(),
      context: triggerContext,
      streams: streams  // ✅ 传递 streams 给 Soul Agent
    };

    const result = await soulAgent.execute(input);

    logger.info('Soul executed successfully', {
      sessionId,
      result
    });

    return {
      status: 200,
      body: {
        success: true,
        sessionId,
        soulId,
        userId,
        result: {
          executed: true,
          output: result.output
        }
      }
    };
  } catch (error: any) {
    logger.error('Failed to execute soul', {
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
