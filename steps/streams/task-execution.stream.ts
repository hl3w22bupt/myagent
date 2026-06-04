/**
 * Task Execution Stream.
 *
 * Real-time stream for tracking agent task execution progress.
 */

import { Stream, type StreamConfig } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store.js';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage.js';

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
  onPersist: async (groupId: string, itemId: string, data: any) => {
    try {
      const store = getDataStore();
      const pool = 'getPool' in store && typeof store.getPool === 'function'
        ? store.getPool()
        : null;
      if (!pool) return;
      const storage = new PostgresTokenUsageStorage(pool);
      await storage.initializeTables();
      await storage.saveExecutionEvent({
        taskId: groupId,
        eventId: itemId,
        type: data.type,
        status: data.status,
        output: data.output,
        error: data.error,
        currentStep: data.currentStep,
        skill: data.skill,
        stage: data.stage,
        progressType: data.progressType,
        executionTime: data.executionTime,
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        taskDescription: data.task,
        // Merge data.data (rich event payload) and data.metadata (extra metadata)
        // so frontend can access event details after page refresh
        metadata: {
          ...(data.metadata || {}),
          ...(data.data ? { data: data.data } : {}),
        },
      });
    } catch (_err) {
      // Silently fail; the in-memory stream is the primary data source
    }
  },
};

export const taskExecutionStream = new Stream(config);
