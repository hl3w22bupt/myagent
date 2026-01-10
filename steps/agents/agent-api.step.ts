/**
 * Agent API Step.
 *
 * REST API endpoint for triggering agent tasks.
 * Accepts HTTP requests and emits agent task events.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

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
   */
  availableSkills: z.array(z.string()).optional().describe('List of available skills'),
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
 */
export const handler = async (request: any, { emit, logger }: any) => {
  // Validate request body
  const validationResult = bodySchema.safeParse(request.body);
  if (!validationResult.success) {
    throw new Error(`Invalid request: ${validationResult.error.message}`);
  }

  const { task, sessionId, systemPrompt, availableSkills } = validationResult.data;

  // Generate unique taskId
  const taskId = `task-${Date.now()}`;

  logger.info('Agent API: Received task request', {
    task,
    sessionId,
    taskId,
    skills: availableSkills,
  });

  // Emit agent task execution event
  // This will be picked up by the Master Agent step
  await emit({
    topic: 'agent.task.execute',
    data: {
      taskId,
      task,
      sessionId,
      systemPrompt,
      availableSkills,
    },
  });

  // Return immediate response
  // In a real system, you might want to use SSE or webhooks for async results
  return {
    status: 200, // OK
    body: {
      success: true,
      message: 'Task submitted for execution',
      taskId,
      task,
      sessionId,
    },
  };
};
