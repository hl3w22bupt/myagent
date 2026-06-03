/**
 * Soul Session Delete API
 *
 * 删除指定的 Soul Agent 实例
 */

import { soulStateDataService } from '../../src/core/database/soul-data-service.js';

import { type StepConfig, logger } from '../../src/iii-bridge.js';

/**
 * Soul Session Delete API configuration.
 */
export const config = {
  name: 'soul-session-delete',
  description: '删除 Soul Agent 实例',

  triggers: [{ type: 'http' as const, method: 'DELETE' as const, path: '/api/soul/:soulId/session/:sessionId' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Soul Session Delete handler.
 */
export const handler = async (context: any) => {
  const soulId = context.request.pathParams?.soulId;
  const sessionId = context.request.pathParams?.sessionId;

  logger.info('Deleting soul session', { soulId, sessionId });

  try {
    // 1. 删除 soul_state
    await soulStateDataService.deleteSoulState(sessionId);

    // 2. soul_contexts 已废弃，无需删除
    // Note: Soul Agent 现在使用 task_contexts 表

    logger.info('Soul session deleted successfully', { soulId, sessionId });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Soul Agent 实例已删除',
        data: {
          soulId,
          sessionId
        }
      }
    };

  } catch (error: any) {
    logger.error('Failed to delete soul session', {
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
