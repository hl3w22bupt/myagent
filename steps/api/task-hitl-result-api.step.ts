/**
 * Task HITL Result API Step.
 *
 * Provides endpoint to set HITL (Human In The Loop) clarification result.
 * This API does NOT trigger new execution - it only saves the clarification result.
 * The Agent will poll internally and resume execution when it sees the completed status.
 */

import { z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { ContextManager } from '../../src/core/context/manager.js';

/**
 * Task HITL Result API Step configuration.
 */
export const config = {
  name: 'task-hitl-result-api',
  description: 'API endpoint for setting HITL clarification result',

  triggers: [{ type: 'http' as const, method: 'PUT' as const, path: '/api/tasks/:id/hitl' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for HITL result.
 */
export const inputSchema = z.object({
  /**
   * The user's decision or response to the clarification question.
   */
  decision: z.string().min(1, 'Decision is required'),

  /**
   * Optional: Additional feedback or context.
   */
  feedback: z.string().optional(),
});

/**
 * Task HITL Result API handler.
 *
 * Handles setting HITL clarification result.
 * Does NOT trigger new execution - Agent polls internally.
 */
export const handler = async (context: any) => {
  logger.info('Task HITL Result API: Received request', { context });

  try {
    // Get task ID from path parameters
    const taskId = context.request.pathParams?.id || context.request?.params?.id || context.request?.params?.id;

    if (!taskId) {
      logger.error('Task HITL Result API: Task ID is missing');
      return {
        status: 400,
        body: {
          success: false,
          message: 'Task ID is required',
        },
      };
    }

    // Parse request body
    const body = context.request.body;
    logger.info('Task HITL Result API: Request body', { body });

    // Validate input
    let decision: string;
    let feedback: string | undefined;
    try {
      const parsedBody = inputSchema.parse(body);
      decision = parsedBody.decision;
      feedback = parsedBody.feedback;
      logger.info('Task HITL Result API: Input validated', { taskId, decision, hasFeedback: !!feedback });
    } catch (validationError: any) {
      logger.error('Task HITL Result API: Input validation failed', {
        error: validationError.message,
        details: validationError.issues,
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

    // Get TaskContext
    const contextManager = new ContextManager();
    const taskContext = await contextManager.getContext(taskId);

    if (!taskContext) {
      logger.error('Task HITL Result API: TaskContext not found', { taskId });
      return {
        status: 404,
        body: {
          success: false,
          message: 'Task not found',
        },
      };
    }

    // Boundary check: HITL state must exist
    if (!taskContext.hitlState) {
      logger.error('Task HITL Result API: HITL state not found', { taskId });
      return {
        status: 404,
        body: {
          success: false,
          message: 'HITL state not found - task is not waiting for clarification',
        },
      };
    }

    // Boundary check: HITL status must be 'awaiting'
    if (taskContext.hitlState.status !== 'awaiting') {
      logger.warn('Task HITL Result API: HITL state is not awaiting', {
        taskId,
        currentStatus: taskContext.hitlState.status,
      });
      return {
        status: 400,
        body: {
          success: false,
          message: `HITL state is not awaiting (current status: ${taskContext.hitlState.status})`,
        },
      };
    }

    // Update HITL state to completed
    taskContext.hitlState.status = 'completed';
    taskContext.hitlState.response = {
      content: decision,
      feedback,
      timestamp: new Date(),
    };

    // Add clarification response to conversation history
    const clarificationMessage = feedback
      ? `${decision}（备注：${feedback}）`
      : decision;

    // Add as a new conversation round
    await contextManager.addConversationRound(taskId, {
      round: (taskContext.conversationRounds?.length || 0) + 1,
      timestamp: new Date(),
      userMessage: clarificationMessage,
      assistantReply: undefined, // Agent will process this and reply
    });

    // Save to database
    await contextManager.saveContext(taskContext);

    logger.info('Task HITL Result API: HITL result saved, Agent will resume', {
      taskId,
      decision,
      hasFeedback: !!feedback,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'HITL result saved, Agent will resume execution',
        data: {
          taskId,
          decision,
          feedback,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error: any) {
    logger.error('Task HITL Result API: Unhandled error', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to save HITL result',
        error: error.message,
      },
    };
  }
};
