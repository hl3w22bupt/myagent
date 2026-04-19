/**
 * Agent Failure Handler Step.
 *
 * Handles agent task failure events and logs them for monitoring.
 * This step eliminates the "no subscriber defined" warning for agent.task.failed.
 */

import { type StepConfig, logger, queue } from 'motia';
import { z } from 'zod';

/**
 * Input schema for failure handler.
 */
export const inputSchema = z.object({
  /**
   * Session ID for the failed task.
   */
  sessionId: z.string(),

  /**
   * Task that failed.
   */
  task: z.string(),

  /**
   * Error message.
   */
  error: z.string(),

  /**
   * Error stack trace (optional).
   */
  stack: z.string().optional(),
});

/**
 * Failure Handler Step configuration.
 */
export const config = {
  name: 'failure-handler',
  description: 'Handles agent task failures and logs them for monitoring',
  triggers: [
    queue('agent.task.failed'),
  ],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Failure Handler.
 *
 * Logs task failures and can be extended to implement retry logic,
 * alerting, or other failure handling strategies.
 */
export const handler = async (input: z.infer<typeof inputSchema>) => {
  const timestamp = new Date().toISOString();

  logger.warn('❌ Agent Task Failed', {
    task: input.task,
    sessionId: input.sessionId,
    error: input.error,
    timestamp,
    hasStack: !!input.stack,
  });

  // Future enhancements:
  // - Implement retry logic with exponential backoff
  // - Send alerts to monitoring systems
  // - Store failures in a database for analysis
  // - Trigger fallback mechanisms

  return {
    handled: true,
    timestamp,
    task: input.task,
  };
};
