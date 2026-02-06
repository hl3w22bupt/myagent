/**
 * Agent API Step.
 *
 * REST API endpoint for triggering agent tasks.
 * Accepts HTTP requests and emits agent task events.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Task counter for generating unique task IDs.
 */
let taskCounter = 0;

/**
 * Request body schema for Agent API.
 */
export const bodySchema = z.object({
  /**
   * Task description to execute.
   */
  task: z.string().describe('Task description for the agent'),

  /**
   * Optional: Session ID for multi-turn conversations.
   */
  sessionId: z.string().optional().describe('Session ID for conversation context'),

  /**
   * Optional: System prompt override.
   */
  systemPrompt: z.string().optional().describe('Custom system prompt'),

  /**
   * Optional: Available skills.
   * If not provided, PTCGenerator will automatically select appropriate skills.
   */
  availableSkills: z.array(z.string()).optional().describe('List of available skills'),

  /**
   * Optional: Use MasterAgent with delegation (default: false).
   * When true, the task will be executed by MasterAgent which can
   * delegate to specialized subagents (code-reviewer, data-analyst, security-auditor).
   */
  useDelegation: z.boolean().optional().describe('Enable MasterAgent delegation'),

  /**
   * Optional: List of subagents to use for delegation (requires useDelegation=true).
   * If not provided, uses default subagents.
   */
  subagents: z.array(z.string()).optional().describe('List of subagent names for delegation'),
});

/**
 * Agent API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-api',
  description: 'REST API endpoint for agent task execution',

  /**
   * API route configuration.
   */
  path: '/agent/execute',
  method: 'POST',

  /**
   * Emit agent task execution event.
   */
  emits: [{ topic: 'agent.task.execute', label: 'Execute agent task' }],

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
 * Agent API handler.
 *
 * Receives HTTP requests and emits agent task events.
 *
 * Note: Skill selection is now handled by PTCGenerator inside the Agent execution flow.
 * If availableSkills is not provided, PTCGenerator will automatically select appropriate skills
 * based on the task description and available skill registry.
 */
export const handler = async (request: any, { emit, logger }: any) => {
  // Validate request body
  const validationResult = bodySchema.safeParse(request.body);
  if (!validationResult.success) {
    throw new Error(`Invalid request: ${validationResult.error.message}`);
  }

  const { task, sessionId, systemPrompt, availableSkills, useDelegation, subagents } =
    validationResult.data;

  // Generate unique taskId with counter to prevent conflicts
  const taskId = `task-${Date.now()}-${++taskCounter}`;

  logger.info('Agent API: Received task request', {
    task,
    sessionId,
    taskId,
    skills: availableSkills,
    useDelegation,
    subagents,
  });

  // Log if no skills provided - PTCGenerator will handle selection
  if (!availableSkills || availableSkills.length === 0) {
    logger.info('No skills provided - PTCGenerator will auto-select skills', { taskId });
  }

  // Emit agent task execution event
  // This will be picked up by the master-agent step
  await emit({
    topic: 'agent.task.execute',
    data: {
      taskId,
      task,
      sessionId,
      systemPrompt,
      availableSkills, // Pass through as-is (empty = let PTCGenerator decide)
      useDelegation,
      subagents,
    },
  });

  // Return immediate response
  return {
    status: 200, // OK
    body: {
      success: true,
      message: useDelegation
        ? 'Task submitted for execution with MasterAgent delegation'
        : 'Task submitted for execution',
      taskId,
      task,
      sessionId,
      useDelegation,
      availableSkills,
    },
  };
};
