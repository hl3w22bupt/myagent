/**
 * Soul Session Delete API
 *
 * 删除指定的 Soul Agent 实例
 */

import { z } from 'zod';
import { soulStateDataService } from '../../src/core/database/soul-data-service';
import { soulExecutionHistoryService } from '../../src/core/database/soul-data-service';

/**
 * Soul Session Delete API configuration.
 */
export const config: any = {
  type: 'api',
  name: 'soul-session-delete',
  description: '删除 Soul Agent 实例',

  path: '/api/soul/:soulId/session/:sessionId',
  method: 'DELETE',

  emits: [],
  flows: [],
};

/**
 * Soul Session Delete handler.
 */
export const handler = async (request: any, { logger }: any) => {
  const soulId = request.pathParams?.soulId || request.params?.soulId;
  const sessionId = request.pathParams?.sessionId || request.params?.sessionId;

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
