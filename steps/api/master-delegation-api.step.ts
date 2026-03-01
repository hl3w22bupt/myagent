/**
 * MasterAgent Delegation API Step.
 *
 * REST API endpoint for executing tasks with MasterAgent delegation.
 * Emits events to trigger task execution through the event system,
 * ensuring all tasks go through TaskHook for unified context management.
 *
 * Features:
 * - Event-driven task execution (emits 'agent.task.execute')
 * - Intelligent task delegation to subagents
 * - Multi-turn conversation support
 * - Session management for conversation context
 * - Unified with /agent/execute execution model
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Request body schema for MasterAgent Delegation API.
 */
export const bodySchema = z
  .object({
    /**
     * Task description to execute.
     */
    task: z.string().describe('Task description for the MasterAgent'),

    /**
     * Optional: Session ID for multi-turn conversations.
     * If not provided, a new session will be created.
     */
    sessionId: z.string().optional().describe('Session ID for conversation context'),

    /**
     * Optional: List of subagents to use for delegation.
     * If not provided, uses default subagents.
     */
    subagents: z
      .array(z.string())
      .optional()
      .describe('List of subagent names to enable'),

    /**
     * Optional: System prompt override for MasterAgent.
     */
    systemPrompt: z.string().optional().describe('Custom system prompt for MasterAgent'),

    /**
     * Optional: Available skills for MasterAgent.
     */
    availableSkills: z.array(z.string()).optional().describe('List of available skills'),
  })
  .passthrough(); // Allow additional fields for future extensibility

/**
 * Default subagents for delegation.
 */
const DEFAULT_SUBAGENTS = ['code-reviewer', 'data-analyst', 'security-auditor'];

/**
 * MasterAgent Delegation API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'master-delegation-api',
  description: 'REST API endpoint for MasterAgent task execution with delegation',

  /**
   * API route configuration.
   * DISABLED: Use /agent/execute instead (has race condition fix and more features)
   */
  path: '/agent/delegate-disabled',
  method: 'POST',

  /**
   * Emit agent task execution event (same as /agent/execute).
   */
  emits: [{ topic: 'agent.task.execute', label: 'Execute agent task with delegation' }],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Task counter for generating unique task IDs.
 */
let taskCounter = 0;

/**
 * MasterAgent Delegation API handler.
 *
 * Emits events to trigger task execution through master-agent.step.ts.
 * This ensures all tasks go through TaskHook for unified context management.
 *
 * Execution flow:
 * 1. Validate request
 * 2. Emit 'agent.task.execute' event
 * 3. master-agent.step.ts processes the event
 * 4. TaskHook executes (context management, metrics, etc.)
 * 5. MasterAgent runs with delegation
 * 6. Results available via API or stream
 */
export const handler = async (request: any, { emit, logger }: any) => {
  // Validate request body
  const validationResult = bodySchema.safeParse(request.body);
  if (!validationResult.success) {
    logger.warn('MasterAgent Delegation API: Invalid request', {
      errors: validationResult.error.issues,
    });

    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid request body',
        errors: validationResult.error.issues,
      },
    };
  }

  const { task, sessionId, subagents, systemPrompt, availableSkills } = validationResult.data;

  // Generate unique taskId with counter to prevent conflicts
  const taskId = `delegate-${Date.now()}-${++taskCounter}`;

  logger.info('MasterAgent Delegation API: Received task request', {
    task,
    sessionId,
    taskId,
    subagents: subagents || DEFAULT_SUBAGENTS,
  });

  try {
    // Emit event to trigger task through master-agent.step.ts
    await emit({
      topic: 'agent.task.execute',
      data: {
        taskId,
        task,
        sessionId,
        systemPrompt,
        availableSkills,
        useDelegation: true, // Enable delegation
        subagents: subagents || DEFAULT_SUBAGENTS,
      },
    });

    logger.info('Task execution event emitted', {
      taskId,
      sessionId,
      useDelegation: true,
      subagents: subagents || DEFAULT_SUBAGENTS,
    });

    // Return immediate response
    return {
      status: 200,
      body: {
        success: true,
        message: 'Task execution started with MasterAgent delegation',
        taskId,
        sessionId,
        note: 'Task is running asynchronously. Check /api/results/:id for progress.',
      },
    };
  } catch (error: any) {
    logger.error('MasterAgent Delegation API: Event emission failed', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    // Return error response
    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to start task execution',
        error: error.message,
        taskId,
      },
    };
  }
};
