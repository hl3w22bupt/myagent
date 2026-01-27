import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'context-compression-api',
  path: '/api/contexts/:id/compression-history',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(request.pathParams.id);
    if (!validationResult.success) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid taskId format',
        },
      };
    }
    const taskId = validationResult.data;

    // 获取压缩历史
    const history = await unifiedStore.getCompressionHistory(taskId);

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
