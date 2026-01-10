/**
 * Task Execution Stream.
 *
 * Real-time stream for tracking agent task execution progress.
 */

import { StreamConfig } from 'motia';
import { z } from 'zod';

/**
 * Task execution status schema.
 */
export const taskExecutionSchema = z.object({
  /**
   * Task ID.
   */
  taskId: z.string(),

  /**
   * Task description.
   */
  task: z.string(),

  /**
   * Current status: pending, running, completed, failed
   */
  status: z.enum(['pending', 'running', 'completed', 'failed']),

  /**
   * Current output being generated.
   */
  output: z.string().optional(),

  /**
   * Error message if failed.
   */
  error: z.string().optional(),

  /**
   * Current step being executed.
   */
  currentStep: z.string().optional(),

  /**
   * Execution time in ms.
   */
  executionTime: z.number().optional(),

  /**
   * Session ID for multi-turn conversations.
   */
  sessionId: z.string().optional(),

  /**
   * Timestamp of last update.
   */
  timestamp: z.string(),

  /**
   * Execution metadata.
   */
  metadata: z.object({
    llmCalls: z.number().optional(),
    skillCalls: z.number().optional(),
    totalTokens: z.number().optional()
  }).optional()
});

export type TaskExecution = z.infer<typeof taskExecutionSchema>;

/**
 * Task Execution Stream configuration.
 */
export const config: StreamConfig = {
  name: 'taskExecution',
  schema: taskExecutionSchema as any,
  baseConfig: { storageType: 'default' }
};
