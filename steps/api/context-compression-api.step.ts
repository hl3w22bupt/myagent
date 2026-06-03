import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store.js';

export const config = {
  name: 'context-compression-api',
  description: 'API endpoint for fetching compression history for a task',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/contexts/:id/compression-history' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();

export const handler: any = async (context: any) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(context.request.pathParams.id);
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
