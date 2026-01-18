/**
 * MasterAgent Delegation API Step.
 *
 * Provides REST API endpoint for executing tasks with MasterAgent delegation.
 * This endpoint directly uses the MasterAgent class to enable intelligent task
 * delegation to specialized subagents.
 *
 * Features:
 * - Direct MasterAgent instantiation (not through AgentManager)
 * - Intelligent task delegation to subagents
 * - Multi-turn conversation support
 * - Session management for conversation context
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { v4 as uuidv4 } from 'uuid';
import { MasterAgent } from '../../src/core/agent/master-agent';
import type { MasterAgentConfig } from '../../src/core/agent/types';

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
   */
  path: '/agent/delegate',
  method: 'POST',

  /**
   * No events emitted - direct execution for synchronous response.
   */
  emits: [],

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
 * Helper function to get Python path.
 */
function getPythonPath(): string {
  return (
    process.env.PYTHON_PATH ||
    process.cwd() + '/python_modules/bin/python3' ||
    process.cwd() + '/.venv/bin/python3' ||
    'python3'
  );
}

/**
 * MasterAgent Delegation API handler.
 *
 * Directly uses MasterAgent to execute tasks with intelligent delegation.
 *
 * Execution flow:
 * 1. Create or reuse session
 * 2. Instantiate MasterAgent with subagent configs
 * 3. Execute task (MasterAgent plans and delegates)
 * 4. Return results with delegation metadata
 */
export const handler = async (request: any, { logger }: any) => {
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

  // Generate or reuse sessionId
  const effectiveSessionId = sessionId || uuidv4();
  const taskId = `master-task-${Date.now()}`;

  logger.info('MasterAgent Delegation API: Starting task execution', {
    task,
    sessionId: effectiveSessionId,
    taskId,
    subagents: subagents || DEFAULT_SUBAGENTS,
  });

  try {
    // Prepare MasterAgent configuration
    const masterConfig: MasterAgentConfig = {
      systemPrompt: systemPrompt || 'You are a helpful assistant with delegation capabilities.',
      availableSkills: availableSkills || ['*'],
      llm: {
        provider: 'anthropic',
        model: process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-5',
      },
      sandbox: {
        type: 'local',
        local: {
          pythonPath: getPythonPath(),
          timeout: parseInt(process.env.TASK_TIMEOUT || '60000'),
        },
      },
      subagents: subagents || DEFAULT_SUBAGENTS,
    };

    // Create MasterAgent instance
    // Note: We create a new instance for each request
    // In production, you might want to cache instances per session
    const masterAgent = new MasterAgent(masterConfig, effectiveSessionId);

    // Verify subagents loaded successfully
    const masterInfo = masterAgent.getInfo();
    logger.info('MasterAgent initialized', {
      type: masterInfo.type,
      subagents: masterInfo.subagents,
      subagentCount: masterInfo.subagents.length,
    });

    // Execute task with delegation
    // MasterAgent will:
    // 1. Plan the task using LLM
    // 2. Decide which subagents to delegate to
    // 3. Execute delegated tasks
    // 4. Synthesize results
    const result = await masterAgent.run(task, taskId);

    logger.info('MasterAgent task execution completed', {
      sessionId: effectiveSessionId,
      taskId,
      success: result.success,
      executionTime: result.executionTime,
      hasOutput: !!result.output,
    });

    // Cleanup session (in production, you might want to keep sessions alive)
    await masterAgent.cleanup();

    // Return successful response with delegation metadata
    return {
      status: 200,
      body: {
        success: true,
        message: 'Task executed with MasterAgent delegation',

        // Task information
        taskId,
        task,
        sessionId: effectiveSessionId,

        // Execution results
        result: {
          success: result.success,
          output: result.output,
          error: result.error,

          // Metadata including delegation information
          executionTime: result.executionTime,
          metadata: result.metadata,

          // Agent state
          state: result.state,
        },

        // Delegation information
        delegation: {
          masterAgentType: masterInfo.type,
          availableSubagents: masterInfo.subagents,
          delegatedTasks: result.metadata?.delegates || [],
        },
      },
    };
  } catch (error: any) {
    logger.error('MasterAgent Delegation API: Execution failed', {
      error: error.message,
      stack: error.stack,
      sessionId: effectiveSessionId,
      taskId,
    });

    // Return error response
    return {
      status: 500,
      body: {
        success: false,
        message: 'Task execution failed',
        error: error.message,
        taskId,
        sessionId: effectiveSessionId,
      },
    };
  }
};
