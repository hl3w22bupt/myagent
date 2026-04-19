import { type Handlers, type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';
import { ContextManager } from '../../src/core/context/manager';

export const config = {
  name: 'context-api',
  description: 'API endpoint for fetching context for a task',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/contexts/:id' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();
const contextManager = new ContextManager(unifiedStore);

export const handler: Handlers<typeof config> = async (context) => {
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

    // 从 task_contexts 获取上下文
    const ctx = await contextManager.getContext(taskId);

    if (!ctx) {
      logger.warn('Context not found', { taskId });

      return {
        status: 404,
        body: {
          success: false,
          error: 'Context not found',
        },
      };
    }

    // 从 tasks 表获取 task metadata（包含 delegates, externalAgent, workspace 等）
    const task = await unifiedStore.getTask(taskId);

    // 构建 conversationHistory（Agent 使用的扁平格式）
    const conversationHistory = contextManager.getConversationHistoryForAgent(ctx);

    logger.info('Context retrieved', {
      taskId,
      contextType: ctx.metadata?.type || 'standard',
      roundsCount: ctx.conversationRounds.length,
      historyCount: conversationHistory.length,
      hasTaskMetadata: !!task?.metadata,
      taskMetadataKeys: task?.metadata ? Object.keys(task.metadata) : [],
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          ...ctx,
          conversationHistory, // 添加对话历史（Agent 格式）
          // 合并 task 表的 metadata（包含 delegates, externalAgent, workspace 等）
          metadata: {
            ...ctx.metadata,
            ...(task?.metadata || {}),
          },
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
