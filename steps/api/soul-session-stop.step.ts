/**
 * Soul Session Stop API
 *
 * 停止指定的 Soul Agent 实例
 */

import { soulStateDataService } from '../../src/core/database/soul-data-service';
import { SoulState } from '../../src/core/agent/soul-types';

import { type StepConfig, logger } from 'motia';

/**
 * Soul Session Stop API configuration.
 */
export const config = {
  name: 'soul-session-stop',
  description: '停止 Soul Agent 实例',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/soul/:soulId/session/:sessionId/stop' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Soul Session Stop handler.
 */
export const handler = async (context: any) => {
  const soulId = context.request.pathParams?.soulId;
  const sessionId = context.request.pathParams?.sessionId;

  logger.info('Stopping soul session', { soulId, sessionId });

  try {
    // 获取当前状态
    const currentState = await soulStateDataService.getSoulState(sessionId);

    if (!currentState) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Soul Agent 实例不存在'
        }
      };
    }

    // 更新状态为 STOPPED
    const stoppedState: SoulState = {
      ...currentState,
      status: 'STOPPED'
    };

    await soulStateDataService.saveSoulState(sessionId, soulId, stoppedState);

    logger.info('Soul session stopped successfully', {
      soulId,
      sessionId,
      previousStatus: currentState.status
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Soul Agent 实例已停止',
        data: {
          soulId,
          sessionId,
          previousStatus: currentState.status
        }
      }
    };

  } catch (error: any) {
    logger.error('Failed to stop soul session', {
      soulId,
      sessionId,
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
