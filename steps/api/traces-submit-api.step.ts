/**
 * Submit Execution Trace API Step.
 *
 * API endpoint for receiving execution traces from Python skills.
 * Python skills use this endpoint to send trace data since they cannot
 * directly access Motia streams.
 */

import type { ApiRouteConfig } from 'motia';
import { z } from 'zod';

/**
 * Submit Execution Trace API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'traces-submit-api',
  description: 'API endpoint for submitting execution traces from Python skills',

  /**
   * API route configuration.
   */
  path: '/api/traces/submit',
  method: 'POST',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Schema for execution trace submission.
 */
const traceSubmitSchema = z.object({
  // Required fields
  id: z.string(),
  taskId: z.string(),
  level: z.enum(['task', 'agent', 'skill', 'tool-call', 'agent-internal', 'skill-internal']),
  stage: z.string().optional(),  // Execution stage (e.g., 'pre', 'post', 'skill_execution', etc.)

  // Optional identification
  agentId: z.string().optional(),
  skillName: z.string().optional(),
  parentId: z.string().optional(),

  // Execution data
  inputData: z.any().optional(),
  outputData: z.any().optional(),
  errorData: z.any().optional(),

  // Retry information
  isRetry: z.boolean().optional().default(false),
  retryAttempt: z.number().optional().default(0),
  retryReason: z.string().optional(),

  // Timing information
  startedAt: z.number().optional(),  // Unix timestamp in milliseconds
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
  timestamp: z.string().optional(),  // ISO 8601 timestamp

  // Status
  status: z.enum(['pending', 'running', 'completed', 'failed']),

  // Additional metadata (e.g., LLM calls, tokens, etc.)
  metadata: z.any().optional(),
});

/**
 * Submit Execution Trace handler.
 */
export const handler = async (
  input: any,
  { logger, streams }: any
) => {
  logger.info('Submit Trace API: Received request');

  try {
    // Parse and validate request body
    const traceData = traceSubmitSchema.parse(input.body);

    logger.info('Submit Trace API: Validated trace data', {
      id: traceData.id,
      taskId: traceData.taskId,
      level: traceData.level,
      status: traceData.status,
    });

    if (!streams || !streams.executionTraces) {
      logger.error('Submit Trace API: Streams not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Streams not available',
        },
      };
    }

    // Store trace data in executionTraces stream
    // Parameter order: (groupId, id, data)
    await streams.executionTraces.set(traceData.taskId, traceData.id, traceData);

    logger.info('Submit Trace API: Trace stored successfully', {
      id: traceData.id,
      taskId: traceData.taskId,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Trace submitted successfully',
        id: traceData.id,
      },
    };
  } catch (error: any) {
    logger.error('Submit Trace API: Error', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to submit trace',
        error: error.message,
      },
    };
  }
};
