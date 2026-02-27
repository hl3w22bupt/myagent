/**
 * Task Chat API Step.
 *
 * Provides endpoint to send chat messages to a specific task.
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import { ContextManager } from '../../src/core/context/manager';

// 防重复请求存储，存储最近处理过的请求ID
const processedRequests = new Map<string, number>();
const DUPLICATE_REQUEST_WINDOW = 5000; // 5秒内防止重复请求

/**
 * Task Chat API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'task-chat-api',
  description: 'API endpoint for sending chat messages to a specific task',

  /**
   * API route configuration.
   */
  path: '/api/tasks/:id/chat',
  method: 'POST',

  /**
   * Emit agent.task.execute event to trigger new execution round.
   */
  emits: ['agent.task.execute'],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Input schema for task chat messages.
 */
export const inputSchema = _z.object({
  /**
   * The message content to send.
   */
  message: _z.string().min(1),
});

/**
 * Task Chat API handler.
 *
 * Handles sending chat messages to a specific task.
 */
export const handler = async (request: any, { logger, streams, emit }: any) => {
  logger.info('Task Chat API: Received request', { request });

  // 生成请求唯一标识符（基于taskId、message内容和sessionId）
  const requestId = `${request.pathParams?.id || request.params?.id}_${request.body?.sessionId}_${request.body?.message}`;
  const now = Date.now();

  // 检查是否在防重复请求窗口内
  if (processedRequests.has(requestId)) {
    const lastProcessedTime = processedRequests.get(requestId)!;
    if (now - lastProcessedTime < DUPLICATE_REQUEST_WINDOW) {
      logger.warn('Task Chat API: Duplicate request detected', {
        taskId: request.pathParams?.id || request.params?.id,
        message: request.body?.message,
        sessionId: request.body?.sessionId,
        lastProcessedTime: new Date(lastProcessedTime).toISOString()
      });
      return {
        status: 429, // 429 Too Many Requests
        body: {
          success: false,
          message: 'Too many requests, please try again later'
        }
      };
    }
  }

  // 立即存储请求处理时间，防止并发请求
  processedRequests.set(requestId, now);

  // 清理过期的请求记录
  const keysToDelete: string[] = [];
  for (const [key, timestamp] of processedRequests.entries()) {
    if (now - timestamp > DUPLICATE_REQUEST_WINDOW) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    processedRequests.delete(key);
  }

  try {
    // Get task ID from path parameters
    logger.info('Task Chat API: Request params', {
      params: request.params,
      pathParams: request.pathParams
    });
    const taskId = request.pathParams?.id || request.params?.id;
    logger.info('Task Chat API: Task ID', { taskId });

    if (!taskId) {
      logger.error('Task Chat API: Task ID is missing');
      return {
        status: 400,
        body: {
          success: false,
          message: 'Task ID is required',
        },
      };
    }

    // Parse request body
    const body = request.body || {};
    logger.info('Task Chat API: Request body', { body });

    // Validate input with detailed error handling
    let message: string;
    try {
      const parsedBody = inputSchema.parse(body);
      message = parsedBody.message;
      logger.info('Task Chat API: Message validated successfully', { taskId, message });
    } catch (validationError: any) {
      logger.error('Task Chat API: Input validation failed', {
        error: validationError.message,
        details: validationError.issues
      });
      return {
        status: 400,
        body: {
          success: false,
          message: 'Invalid request body',
          error: validationError.message,
          details: validationError.issues,
        },
      };
    }

    // Check if streams and taskExecution are available
    if (!streams) {
      logger.error('Task Chat API: Streams not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Streams not available',
        },
      };
    }

    if (!streams.taskExecution) {
      logger.error('Task Chat API: Task execution stream not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Task execution stream not available',
        },
      };
    }

    // 获取或生成 sessionId，并从数据库获取任务信息（包括 subagent）
    let sessionId = request.body?.sessionId;
    let taskStatus: string | undefined;
    let subagent: string | undefined; // 保存 subagent 用于后续委派

    // 从数据库中获取任务信息（无论前端是否提供 sessionId）
    // 因为需要获取 subagent 信息用于多轮对话委派
    try {
      const dataStore = getDataStore();
      await dataStore.initialize(); // 确保 DataStore 已初始化
      const taskResult = await dataStore.getTask(taskId);

      if (taskResult) {
        // 如果前端没有提供 sessionId，使用数据库中的
        if (!sessionId) {
          sessionId = taskResult.sessionId;
        }
        taskStatus = taskResult.status;
        subagent = taskResult.metadata?.subagent as string; // 获取 subagent
        logger.info('Task Chat API: Retrieved task info from database', {
          taskId,
          sessionId,
          status: taskStatus,
          subagent
        });
      } else {
        logger.warn('Task Chat API: Task not found in database', { taskId });
      }
    } catch (dbError: any) {
      logger.error('Task Chat API: Failed to retrieve task info from database', {
        taskId,
        error: dbError.message
      });
    }

    // === HITL Checkpoint: Handle clarification response ===
    // Check if task is in awaiting_clarification status
    if (taskStatus === 'awaiting_clarification') {
      logger.info('Task Chat API: Received clarification for task', { taskId, message });

      try {
        const contextManager = new ContextManager();
        const taskContext = await contextManager.getContext(taskId);

        if (taskContext?.hitlState && taskContext.hitlState.status === 'awaiting') {
          // Update HITL state to completed
          taskContext.hitlState.status = 'completed';
          taskContext.hitlState.response = {
            content: message,
            timestamp: new Date()
          };

          await contextManager.saveContext(taskContext);
          logger.info('Task Chat API: HITL state updated to completed', { taskId });
        }

        // Send clarification message to stream (so frontend can display it)
        const timestamp = Date.now();
        const uniqueId = `${taskId}-chat-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;

        await streams.taskExecution.set(taskId, uniqueId, {
          taskId: taskId,
          task: message,
          status: 'running',
          sessionId: sessionId || '',
          timestamp: new Date(timestamp).toISOString(),
          type: 'task',
          stage: 'processing',
          progressType: 'chat',
          metadata: {
            data: {
              message: message,
              sender: 'user',
              clarification: true // Mark as clarification response
            }
          }
        });

        logger.info('Task Chat API: Clarification message sent to stream', { taskId, message });

        // Re-trigger task execution with clarified content
        await emit({
          topic: 'agent.task.execute',
          data: {
            task: message, // Use clarified message as new task
            sessionId: sessionId || '',
            taskId, // Same taskId to continue from checkpoint
            isClarificationResponse: true, // Flag to indicate this is a clarification response
            subagent, // 传递 subagent 用于委派
          },
        });

        logger.info('Task Chat API: Task execution re-triggered after clarification', { taskId });

        return {
          status: 200,
          body: {
            success: true,
            message: '澄清已收到，任务将继续执行',
            data: {
              taskId,
              message,
              timestamp: new Date().toISOString(),
              clarification: true
            },
          },
        };
      } catch (hitlError: any) {
        logger.error('Task Chat API: Failed to handle HITL clarification', {
          taskId,
          error: hitlError.message,
          stack: hitlError.stack
        });
        return {
          status: 500,
          body: {
            success: false,
            message: 'Failed to process clarification',
            error: hitlError.message,
          },
        };
      }
    }

    // Send chat message to task execution stream
    const timestamp = Date.now();
    const uniqueId = `${taskId}-chat-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;

    logger.info('Task Chat API: Attempting to send message to stream', {
      taskId,
      uniqueId,
      message,
      sessionId
    });

    try {
      const streamResult = await streams.taskExecution.set(taskId, uniqueId, {
        taskId: taskId,
        task: message,
        status: 'running',
        sessionId: sessionId || '',
        timestamp: new Date(timestamp).toISOString(),
        type: 'skill',
        skill: 'chat',
        stage: 'processing',
        progressType: 'chat',
        metadata: {
          data: {
            message: message,
            sender: 'user'
          }
        }
      });

      logger.info('Task Chat API: Message sent to stream successfully', {
        taskId,
        message,
        streamResult
      });
    } catch (streamError: any) {
      logger.error('Task Chat API: Failed to send message to stream', {
        error: streamError.message,
        stack: streamError.stack
      });
      return {
        status: 500,
        body: {
          success: false,
          message: 'Failed to send message to stream',
          error: streamError.message,
        },
      };
    }

    logger.info('Task Chat API: Message processing complete', { taskId, message, sessionId, subagent });

    // CRITICAL: Trigger new task execution round
    // This ensures the conversation continues and output is updated
    await emit({
      topic: 'agent.task.execute',
      data: {
        task: message,
        sessionId: sessionId || '',
        taskId, // Use same taskId to update the same task record
        continue: true, // Indicate this is a continuation
        subagent, // 传递 subagent 用于委派，保持多轮对话使用同一 subagent
      },
    });

    logger.info('Task Chat API: Task execution event emitted', { taskId, message });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Message sent successfully',
        data: {
          taskId,
          message,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error: any) {
    logger.error('Task Chat API: Unhandled error', {
      error: error.message,
      stack: error.stack
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to send chat message',
        error: error.message,
      },
    };
  }
};
void _z; // Mark as unused