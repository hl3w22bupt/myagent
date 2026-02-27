/**
 * Get Session API Step
 *
 * 获取会话详情，包括任务列表、上下文、消息和产物
 * 用于 MyEcho 集成
 */

import { z } from 'zod';
import type { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * 请求参数验证
 */
const paramsSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

/**
 * API 配置
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'get-session',
  description: 'Get session details with tasks, messages, and artifacts',
  path: '/api/sessions/:sessionId',
  method: 'GET',
  emits: [],
};

/**
 * API Handler
 */
export const handler = async (request: any, { logger }: any) => {
  try {
    // 获取路径参数
    const sessionId = request.pathParams?.sessionId || request.params?.sessionId;

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

    if (!session) {
      logger.info('Get Session API: Session not found', { sessionId });
      return {
        status: 404,
        body: {
          success: false,
          error: 'Session not found',
        },
      };
    }

    // 获取该会话的所有任务
    const { tasks } = await store.listTasks({ sessionId });

    // 获取第一个任务的上下文（假设一个 session 对应一个主要上下文）
    let context = null;
    let messages = [];
    let artifacts = [];

    if (tasks.length > 0) {
      const firstTaskId = tasks[0].id;
      context = await store.getContext(firstTaskId);
      messages = context?.messages || [];
      artifacts = await store.getArtifacts(firstTaskId);
    }

    return {
      status: 200,
      body: {
        success: true,
        data: {
          sessionId: session.sessionId,
          createdAt: session.createdAt.toISOString(),
          lastActiveAt: session.lastActiveAt.toISOString(),
          metadata: session.metadata,
          tasks: tasks.map((t: any) => ({
            taskId: t.id,
            task: t.task,
            status: t.status,
            createdAt: t.createdAt.toISOString(),
            completedAt: t.completedAt?.toISOString(),
            output: t.output,
          })),
          context: context ? {
            currentTurn: context.currentTurn,
            summary: context.summary,
            workingMemory: context.workingMemory,
          } : null,
          messages: messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.metadata?.timestamp || new Date().toISOString(),
          })),
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
      sessionId: request.params?.sessionId,
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
