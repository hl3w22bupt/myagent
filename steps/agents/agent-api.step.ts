/**
 * Agent API Step.
 *
 * REST API endpoint for triggering agent tasks.
 * Accepts HTTP requests and emits agent task events.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { spawn } from 'child_process';
import { join } from 'path';

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
 * Execute Python script for skill selection.
 */
async function autoSelectSkill(task: string, logger: any): Promise<string[]> {
  return new Promise((resolve, _reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'select_skill.py');
    const python = spawn('python3', [scriptPath, task], {
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        // Skill selection failed, return empty array (no skills)
        logger?.warn('Skill selection failed, continuing without skills', {
          error: stderr,
        });
        resolve([]);
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.selected && result.skill_name) {
          resolve([result.skill_name]);
        } else {
          resolve([]);
        }
      } catch (error) {
        logger?.warn('Failed to parse skill selection result', {
          error: error instanceof Error ? error.message : String(error),
          stdout,
        });
        resolve([]);
      }
    });

    python.on('error', (error) => {
      logger?.warn('Skill selection process error', { error });
      resolve([]);
    });
  });
}

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

  // === Auto-select skills if not provided ===
  let finalSkills = availableSkills;
  if (!finalSkills || finalSkills.length === 0) {
    logger.info('No skills provided, auto-selecting...', { taskId });
    try {
      finalSkills = await autoSelectSkill(task, logger);
      if (finalSkills.length > 0) {
        logger.info('Auto-selected skills', { taskId, skills: finalSkills });
      } else {
        logger.info('No matching skills found', { taskId });
      }
    } catch (error: any) {
      logger.warn('Skill selection failed, continuing without skills', {
        taskId,
        error: error.message,
      });
      finalSkills = [];
    }
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
      availableSkills: finalSkills, // Use auto-selected skills
      useDelegation, // Pass delegation flag
      subagents, // Pass subagents list
    },
  });

  // Return immediate response
  // In a real system, you might want to use SSE or webhooks for async results
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
    },
  };
};
