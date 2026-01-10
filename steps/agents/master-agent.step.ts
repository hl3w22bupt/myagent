/**
 * Master Agent Step (Production Implementation).
 *
 * This is the full production implementation that uses the global
 * AgentManager instance for session-scoped Agent instances.
 *
 * Features:
 * - Session-scoped Agent instances via AgentManager (imported from src/index.ts)
 * - Multi-turn conversation support
 * - Automatic session cleanup
 * - Configuration unified with application-wide settings
 */

import type { EventConfig } from 'motia';
import { z as _z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { agentManager } from '../../src/index';

/**
 * Input schema for Master Agent step.
 */
export const inputSchema = _z.object({
  /**
   * Task ID for tracking.
   */
  taskId: _z.string().optional(),

  /**
   * Task description to execute.
   */
  task: _z.string(),

  /**
   * Optional: Session ID for multi-turn conversations.
   * If not provided, a new session will be created.
   */
  sessionId: _z.string().optional(),

  /**
   * Optional: Whether to continue previous conversation.
   */
  continue: _z.boolean().optional(),
});

/**
 * Master Agent Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute'],
  emits: ['agent.task.completed', 'agent.task.failed'],
  flows: ['agent-workflow'],
};

/**
 * Master Agent handler.
 *
 * This is the full production implementation that:
 * - Uses global AgentManager to acquire session-scoped Agent instances
 * - Supports multi-turn conversations via sessionId
 * - Returns sessionId for continued conversations
 * - Maintains session state (no release in finally)
 */
export const handler = async (
  input: _z.infer<typeof inputSchema>,
  { emit, logger, state: _state, streams }: any
) => {
  // Get or create sessionId
  const sessionId = input.sessionId || uuidv4();
  const taskId = input.taskId || `task-${Date.now()}`;

  logger.info('Master Agent: Starting task execution', {
    task: input.task,
    sessionId,
    taskId,
  });

  // Helper function to update stream
  const updateStream = async (status: string, data?: any) => {
    try {
      await streams.taskExecution.set(taskId, taskId, {
        taskId,
        task: input.task,
        status,
        sessionId,
        timestamp: new Date().toISOString(),
        ...data,
      });
    } catch (error) {
      logger.warn('Failed to update stream', { error });
    }
  };

  // Set initial status to pending
  await updateStream('pending', { currentStep: 'Initializing' });

  try {
    // Update status to running
    await updateStream('running', { currentStep: 'Acquiring agent' });

    // Get Agent from Manager (each session has independent Agent instance)
    const agent = await agentManager.acquire(sessionId);

    logger.info('Agent acquired', { sessionId });
    await updateStream('running', { currentStep: 'Agent acquired, starting execution' });

    // If continuing conversation, get history
    if (input.continue) {
      const agentState = agent.getState();
      logger.info('Continuing conversation', {
        sessionId,
        conversationLength: agentState.conversationHistory.length,
      });
      await updateStream('running', {
        currentStep: `Continuing conversation (${agentState.conversationHistory.length} messages)`,
      });
    }

    // Execute task (Agent maintains session state)
    await updateStream('running', { currentStep: 'Executing task' });
    const result = await agent.run(input.task);

    logger.info('Task execution completed', {
      sessionId,
      success: result.success,
      executionTime: result.executionTime,
    });

    // Update stream with completed status
    await updateStream('completed', {
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      currentStep: 'Task completed',
      metadata: result.metadata,
    });

    // Emit completion event
    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        task: input.task,
        result: {
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime,
          state: result.state,
          metadata: result.metadata,
        },
      },
    });

    // Return sessionId so client can continue conversation
    return {
      success: true,
      sessionId,
      taskId,
      output: result.output,
      state: result.state,
    };
  } catch (error: any) {
    logger.error('Agent execution failed', {
      error: error.message,
      stack: error.stack,
      sessionId,
    });

    // Update stream with failed status
    await updateStream('failed', {
      error: error.message,
      currentStep: 'Task failed',
    });

    // Emit failure event
    await emit({
      topic: 'agent.task.failed',
      data: {
        taskId,
        sessionId,
        task: input.task,
        error: error.message,
        stack: error.stack,
      },
    });

    throw error;
  } finally {
    // Keep session alive - don't release!
    // Manager will automatically cleanup expired sessions
    // await agentManager.release(sessionId);
  }
};
