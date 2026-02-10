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
   * Current status: pending, running, completed, failed, awaiting_clarification
   */
  status: z.enum(['pending', 'started', 'running', 'completed', 'failed', 'awaiting_clarification']),

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
   * Message type: task, skill, agent, or agent lifecycle events
   */
  type: z.enum([
    'task',                    // User task or chat message
    'skill',                   // Skill execution
    'agent',                   // Agent general message
    'agent_created',           // Agent instance created
    'agent_acquired',          // Agent instance acquired
    'agent_status',            // Agent status update
    'intent_analysis',         // Intent analysis result
    'ptc_planning',            // PTC (Python Tool Chain) planning
    'awaiting_clarification'   // HITL (Human-in-the-Loop) clarification request
  ]).default('task'),

  /**
   * Skill name (only for skill type messages)
   */
  skill: z.string().optional(),

  /**
   * Skill execution stage (only for skill type messages): pre, processing, post
   */
  stage: z.enum(['pre', 'processing', 'post']).optional(),

  /**
   * Progress type (only for skill type messages): step, heartbeat, status, chat
   */
  progressType: z.enum(['step', 'heartbeat', 'status', 'chat']).optional(),

  /**
   * Execution metadata.
   */
  metadata: z
    .object({
      llmCalls: z.number().optional(),
      skillCalls: z.number().optional(),
      totalTokens: z.number().optional(),
      data: z.any().optional(),
    })
    .optional(),
});

export type TaskExecution = z.infer<typeof taskExecutionSchema>;

/**
 * Task Execution Stream configuration.
 */
export const config: StreamConfig = {
  name: 'taskExecution',
  schema: taskExecutionSchema as any,
  baseConfig: { storageType: 'default' },
};
