/**
 * Task Chat API Step.
 *
 * Provides endpoint to send chat messages to a specific task.
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';

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
   * Emit chat event for Agent to process.
   */
  emits: ['agent.task.chat'],

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

    // Send chat message to task execution stream
    const timestamp = Date.now();
    const uniqueId = `${taskId}-chat-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;

    logger.info('Task Chat API: Attempting to send message to stream', {
      taskId,
      uniqueId,
      message
    });

    try {
      const streamResult = await streams.taskExecution.set(taskId, uniqueId, {
        taskId: taskId,
        task: message,
        status: 'running',
        sessionId: request.body?.sessionId || '',
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

    logger.info('Task Chat API: Message processing complete', { taskId, message });

    // 发送chat事件让Agent处理
    await emit({
      topic: 'agent.task.chat',
      data: {
        taskId,
        sessionId: request.body?.sessionId || '',
        message,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Task Chat API: Chat event emitted', { taskId, message });

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