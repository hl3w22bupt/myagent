import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';
import { ContextManager } from '../../src/core/context/manager';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'context-api',
  path: '/api/contexts/:id',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();
const contextManager = new ContextManager(unifiedStore);

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

    // 从 task_contexts 获取上下文
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

    // 构建 conversationHistory（Agent 使用的扁平格式）
    const conversationHistory = contextManager.getConversationHistoryForAgent(context);

    logger.info('Context retrieved', {
      taskId,
      contextType: context.metadata?.type || 'standard',
      roundsCount: context.conversationRounds.length,
      historyCount: conversationHistory.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          ...context,
          conversationHistory, // 添加对话历史（Agent 格式）
        },
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve context', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    };
  }
};
