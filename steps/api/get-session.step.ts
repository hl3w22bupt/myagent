/**
 * Get Session API Step
 *
 * 获取会话详情，包括任务列表、上下文、消息和产物
 * 用于 MyEcho 集成
 */

import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * 请求参数验证
 */
export const paramsSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

/**
 * API 配置
 */
export const config = {
  name: 'get-session',
  description: 'Get session details with tasks, messages, and artifacts',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/sessions/:sessionId' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * API Handler
 */
export const handler: any = async (context: any) => {
  try {
    // 获取路径参数
    const sessionId = context.request.pathParams?.sessionId;

    if (!sessionId) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Session ID is required',
        },
      };
    }

    logger.info('Get Session API: Fetching session', { sessionId });

    const store = getDataStore();
    await store.initialize();

    // 获取会话信息
    const session = await store.getSession(sessionId);

    // 如果会话不存在，尝试从任务表获取数据
    let tasks = [];
    let _isVirtualSession = false;

    if (!session) {
      logger.info('Get Session API: Session not found in sessions table, trying tasks table', { sessionId });
      // 尝试获取该 session 的任务
      const tasksResult = await store.listTasks({ sessionId });
      tasks = tasksResult.tasks;

      if (tasks.length === 0) {
        return {
          status: 404,
          body: {
            success: false,
            error: 'Session not found',
          },
        };
      }

      _isVirtualSession = true;
    } else {
      // 获取该会话的所有任务
      const tasksResult = await store.listTasks({ sessionId });
      tasks = tasksResult.tasks;
    }

    // 获取关联的用户（通过 last_session_id）
    let userId = null;
    try {
      const client = (store as any).pool;
      const userResult = await client.query(
        'SELECT user_id FROM users WHERE last_session_id = $1 LIMIT 1',
        [sessionId]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].user_id;
      }
    } catch (err) {
      // 忽略错误，userId 保持为 null
      logger.warn('Failed to fetch userId', { error: err instanceof Error ? err.message : String(err), sessionId });
    }

    // 获取第一个任务的上下文（假设一个 session 对应一个主要上下文）
    let ctx = null;
    let conversationRounds = [];
    let artifacts = [];

    if (tasks.length > 0) {
      const firstTaskId = tasks[0].id;
      ctx = await store.getContext(firstTaskId);
      conversationRounds = ctx?.conversationRounds || [];
      artifacts = await store.getArtifacts(firstTaskId);
    }

    // 构建 session 数据（虚拟 session 使用任务的创建时间）
    const sessionData = session || {
      sessionId,
      createdAt: tasks.length > 0 ? tasks[0].createdAt : new Date(),
      lastActiveAt: tasks.length > 0 ? tasks[tasks.length - 1].createdAt : new Date(),
      metadata: { isVirtualSession: true },
    };

    return {
      status: 200,
      body: {
        success: true,
        data: {
          sessionId: sessionData.sessionId,
          userId: userId,
          createdAt: sessionData.createdAt.toISOString(),
          lastActiveAt: sessionData.lastActiveAt.toISOString(),
          metadata: sessionData.metadata,
          tasks: tasks.map((t: any) => ({
            taskId: t.id,
            task: t.task,
            status: t.status,
            createdAt: t.createdAt.toISOString(),
            completedAt: t.completedAt?.toISOString(),
            output: t.output,
          })),
          context: ctx ? {
            summary: ctx.summary,
            workingMemory: ctx.workingMemory,
            conversationRounds: ctx.conversationRounds,
          } : null,
          messages: conversationRounds.flatMap((r: any) => [
            {
              id: `msg-${r.round}-user`,
              role: 'user',
              content: r.userMessage,
              timestamp: r.timestamp,
            },
            ...(r.assistantOutput ? [{
              id: `msg-${r.round}-assistant`,
              role: 'assistant',
              content: r.assistantOutput,
              timestamp: r.timestamp,
            }] : []),
          ]),
          artifacts: artifacts.map((a: any) => ({
            id: a.id,
            type: a.artifactType,
            action: a.action,
            path: a.path,
            description: a.description,
            timestamp: a.timestamp,
          })),
        },
      },
    };
  } catch (error: any) {
    logger.error('Get Session API: Error', {
      error: error.message,
      sessionId: context.request.pathParams?.sessionId,
    });

    if (error instanceof z.ZodError) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Validation failed',
          details: error.issues,
        },
      };
    }

    return {
      status: 500,
      body: {
        success: false,
        error: 'Internal server error',
        message: error.message,
      },
    };
  }
};
