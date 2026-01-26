import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';

export const config: APIConfig = {
  type: 'api',
  name: 'context-compression-api',
  path: '/api/contexts/:id/compression-history',
  method: 'GET',
  emits: [],
};

const contextStore = getContextStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const taskId = request.params.id;

    // 获取压缩历史
    const history = await contextStore.getCompressionHistory(taskId);

    logger.info('Compression history retrieved', {
      taskId,
      historyCount: history.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: history,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve compression history', {
      error: (error as Error).message,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
