/**
 * Master Agent Step (Simplified for Motia Integration).
 *
 * This is a simplified version that demonstrates Motia integration
 * without the complex Agent class dependencies.
 *
 * In production, this would:
 * 1. Receive agent task requests via events
 * 2. Use the Agent class to generate PTC code
 * 3. Execute code in the Sandbox
 * 4. Emit results
 */

import { z } from 'zod';
import { EventConfig } from 'motia';

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
   */
  sessionId: z.string().optional(),

  /**
   * Optional: Available skills for this task.
   */
  availableSkills: z.array(z.string()).optional()
});

/**
 * Master Agent Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master Agent that orchestrates task execution using PTC code generation',

  /**
   * Subscribe to agent task requests.
   */
  subscribes: ['agent.task.execute'],

  /**
   * Emit results and events.
   */
  emits: [
    'agent.task.completed',
    'agent.task.failed',
    { topic: 'agent.step.started', label: 'Agent step started' },
    { topic: 'agent.step.completed', label: 'Agent step completed', conditional: true }
  ],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow']
};

/**
 * Master Agent handler.
 *
 * This is a simplified demonstration version.
 * The full implementation would integrate with:
 * - src/core/agent/agent.ts - Agent class
 * - src/core/sandbox/factory.ts - Sandbox execution
 * - src/core/agent/llm-client.ts - LLM API calls
 */
export const handler = async (
  input: z.infer<typeof inputSchema>,
  { emit, logger, state }: any
) => {
  logger.info('Master Agent: Starting task execution', { task: input.task });

  try {
    // Step 1: Emit start event
    logger.info('Master Agent: Emitting start event');
    await emit({
      topic: 'agent.step.started',
      data: {
        task: input.task,
        timestamp: Date.now()
      }
    });
    logger.info('Master Agent: Start event emitted successfully');

    // Step 2: Simulated Agent execution
    logger.info('Master Agent: Processing task with simulated execution');

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulated result
    const simulatedResult = {
      success: true,
      output: `Task processed: ${input.task}`,
      executionTime: 100,
      metadata: {
        llmCalls: 1,
        skillCalls: 0,
        totalTokens: 0
      }
    };

    logger.info('Master Agent: Task processed, storing result');

    // Step 3: Store result in state (for history) - skip if state is not available
    try {
      if (input.sessionId && state) {
        await state.set(
          `agent:session:${input.sessionId}:last_result`,
          {
            task: input.task,
            result: simulatedResult,
            timestamp: Date.now()
          }
        );
        logger.info('Master Agent: Result stored in state');
      }
    } catch (stateError: any) {
      logger.warn('Master Agent: Failed to store in state', {
        error: stateError.message
      });
    }

    // Step 4: Emit completion event
    logger.info('Master Agent: Emitting completion event');
    await emit({
      topic: 'agent.task.completed',
      data: {
        task: input.task,
        success: simulatedResult.success,
        output: simulatedResult.output,
        metadata: simulatedResult.metadata,
        sessionId: input.sessionId
      }
    });
    logger.info('Master Agent: Completion event emitted successfully');

    // Step 5: Emit step completed event (conditional)
    if (simulatedResult.success) {
      logger.info('Master Agent: Emitting step completed event');
      await emit({
        topic: 'agent.step.completed',
        data: {
          task: input.task,
          output: simulatedResult.output,
          executionTime: simulatedResult.executionTime
        }
      });
      logger.info('Master Agent: Step completed event emitted successfully');
    }

    logger.info('Master Agent: Task execution completed successfully');
    return simulatedResult;

  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || 'No stack trace';

    logger.error('Master Agent: Task execution failed', {
      error: errorMessage,
      stack: errorStack,
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });

    // Emit failure event
    try {
      await emit({
        topic: 'agent.task.failed',
        data: {
          task: input.task,
          error: errorMessage,
          timestamp: Date.now()
        }
      });
    } catch (emitError: any) {
      logger.error('Master Agent: Failed to emit failure event', {
        error: emitError.message
      });
    }

    throw error;
  }
};
