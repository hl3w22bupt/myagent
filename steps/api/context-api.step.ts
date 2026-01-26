import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';
import { ContextManager } from '../../src/core/context/manager';

export const config: APIConfig = {
  type: 'api',
  name: 'context-api',
  path: '/api/contexts/:id',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const contextStore = getContextStore();
const contextManager = new ContextManager(contextStore);

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(request.params.id);
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

    // 获取上下文
    const context = await contextManager.getContext(taskId);

    if (!context) {
      logger.warn('Context not found', { taskId });

      return {
        status: 404,
        body: {
          success: false,
          error: 'Context not found',
        },
      };
    }

    logger.info('Context retrieved', {
      taskId,
      currentTurn: context.currentTurn,
      messageCount: context.messages.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: context,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve context', {
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
