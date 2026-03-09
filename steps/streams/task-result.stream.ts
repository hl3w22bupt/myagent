/**
 * Task Result Stream.
 *
 * Real-time stream for pushing processed task results.
 * Data is pushed AFTER task-result-handler processes and normalizes it.
 *
 * This ensures the stream data is **exactly the same** as the API response:
 * - Artifacts are properly extracted and normalized
 * - Paths are corrected (with proper prefixes)
 * - Output is parsed from unified format
 * - Data structure matches /agent/result API response
 */

import { StreamConfig } from 'motia';
import { z } from 'zod';

/**
 * Artifact schema - matches the structure returned by /agent/result API.
 */
const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'code', 'infographic', 'table', 'audio', 'text', 'image']),
  action: z.enum(['generated', 'uploaded', 'created']),
  path: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional(),
  timestamp: z.string(), // ISO string format
});

/**
 * Task result stream schema.
 *
 * IMPORTANT: This schema must match the response format from /agent/result API.
 * Any changes to the API response should be reflected here.
 */
export const taskResultSchema = z.object({
  /**
   * Task ID.
   */
  taskId: z.string(),

  /**
   * Task description.
   */
  task: z.string(),

  /**
   * Session ID for multi-turn conversations.
   */
  sessionId: z.string().optional(),

  /**
   * Application identifier.
   */
  app: z.string().optional(),

  /**
   * Execution success status.
   */
  success: z.boolean(),

  /**
   * Task status: completed, failed, awaiting_clarification, timeout
   */
  status: z.enum(['completed', 'failed', 'awaiting_clarification', 'timeout']),

  /**
   * Plain text output from the agent.
   */
  output: z.string().optional(),

  /**
   * Error message if failed.
   */
  error: z.string().optional(),

  /**
   * Execution time in milliseconds.
   */
  executionTime: z.number().optional(),

  /**
   * Structured output (parsed from unified format).
   */
  structuredOutput: z.any().optional(),

  /**
   * Execution metadata (parsed character-indexed metadata).
   */
  metadata: z
    .object({
      llmCalls: z.number().optional(),
      skillCalls: z.number().optional(),
      totalTokens: z.number().optional(),
      skillNames: z.array(z.string()).optional(),
      conversationLength: z.number().optional(),
      executionCount: z.number().optional(),
      data: z.any().optional(),
    })
    .optional(),

  /**
   * All extracted artifacts (videos, codes, infographics, etc.).
   * Matches the format returned by /agent/result API.
   */
  artifacts: z.array(artifactSchema).optional(),

  /**
   * Pinned status (for UI).
   */
  pinned: z.boolean().optional(),

  /**
   * Timestamp when result was processed.
   */
  timestamp: z.string(),
});

export type TaskResult = z.infer<typeof taskResultSchema>;

/**
 * Task Result Stream configuration.
 */
export const config: StreamConfig = {
  name: 'taskResult',
  schema: taskResultSchema as any,
  baseConfig: { storageType: 'default' },
};
