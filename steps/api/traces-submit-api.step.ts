/**
 * Submit Execution Trace API Step.
 *
 * API endpoint for receiving execution traces from Python skills.
 * Python skills use this endpoint to send trace data since they cannot
 * directly access Motia streams.
 */

import { type Handlers, type StepConfig, logger, enqueue } from 'motia';
import { z } from 'zod';
import { executionTracesStream } from '../streams/execution-traces.stream';

/**
 * Submit Execution Trace API Step configuration.
 */
export const config = {
  name: 'traces-submit-api',
  description: 'API endpoint for submitting execution traces from Python skills',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/traces/submit' }],
  enqueues: ['execution.trace.created'] as const,
} as const satisfies StepConfig;

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
export const handler: Handlers<typeof config> = async (context) => {
  logger.info('Submit Trace API: Received request');

  try {
    // Parse and validate request body
    const traceData = traceSubmitSchema.parse(context.request.body);

    logger.info('Submit Trace API: Validated trace data', {
      id: traceData.id,
      taskId: traceData.taskId,
      level: traceData.level,
      status: traceData.status,
    });

    // Store trace data in executionTraces stream
    await executionTracesStream.set(traceData.taskId, traceData.id, traceData);

    logger.info('Submit Trace API: Trace stored successfully', {
      id: traceData.id,
      taskId: traceData.taskId,
    });

    // Emit execution.trace.created event for token usage extraction
    // Use startsWith to match llm_call, llm_call_execute, llm_call_skill_prompt, etc.
    if (traceData.stage?.startsWith('llm_call')) {
      await enqueue({
        topic: 'execution.trace.created',
        data: traceData,
      });
      logger.info('Submit Trace API: Emitted execution.trace.created event', {
        traceId: traceData.id,
        taskId: traceData.taskId,
        stage: traceData.stage,
      });
    }

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
