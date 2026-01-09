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
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { agentManager } from '../../src/index';

/**
 * Input schema for Master Agent step.
 */
export const inputSchema = z.object({
  /**
   * Task description to execute.
   */
  task: z.string(),

  /**
   * Optional: Session ID for multi-turn conversations.
   * If not provided, a new session will be created.
   */
  sessionId: z.string().optional(),

  /**
   * Optional: Whether to continue previous conversation.
   */
  continue: z.boolean().optional()
});

/**
 * Master Agent Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute'],
  emits: [
    'agent.task.completed',
    'agent.task.failed'
  ],
  flows: ['agent-workflow']
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
  input: z.infer<typeof inputSchema>,
  { emit, logger, state }: any
) => {
  // Get or create sessionId
  const sessionId = input.sessionId || uuidv4();

  logger.info('Master Agent: Starting task execution', {
    task: input.task,
    sessionId
  });

  try {
    // Get Agent from Manager (each session has independent Agent instance)
    const agent = await agentManager.acquire(sessionId);

    logger.info('Agent acquired', { sessionId });

    // If continuing conversation, get history
    if (input.continue) {
      const agentState = agent.getState();
      logger.info('Continuing conversation', {
        sessionId,
        conversationLength: agentState.conversationHistory.length
      });
    }

    // Execute task (Agent maintains session state)
    const result = await agent.run(input.task);

    logger.info('Task execution completed', {
      sessionId,
      success: result.success,
      executionTime: result.executionTime
    });

    // Emit completion event
    await emit({
      topic: 'agent.task.completed',
      data: {
        sessionId,
        task: input.task,
        result: {
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime,
          state: result.state,
          metadata: result.metadata
        }
      }
    });

    // Return sessionId so client can continue conversation
    return {
      success: true,
      sessionId,
      output: result.output,
      state: result.state
    };

  } catch (error: any) {
    logger.error('Agent execution failed', {
      error: error.message,
      stack: error.stack,
      sessionId
    });

    // Emit failure event
    await emit({
      topic: 'agent.task.failed',
      data: {
        sessionId,
        task: input.task,
        error: error.message,
        stack: error.stack
      }
    });

    throw error;

  } finally {
    // Keep session alive - don't release!
    // Manager will automatically cleanup expired sessions
    // await agentManager.release(sessionId);
  }
};
