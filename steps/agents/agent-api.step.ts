/**
 * Agent API Step.
 *
 * REST API endpoint for triggering agent tasks.
 * Accepts HTTP requests and emits agent task events.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';
import { MessageIdGenerator } from '../../src/utils/message-id-generator';

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
   * Optional: Application identifier.
   * Used to categorize tasks by application (e.g., 'myecho', 'default').
   */
  app: z.string().optional().describe('Application identifier (e.g., myecho, default)'),

  /**
   * Optional: Use MasterAgent with delegation (default: false).
   * When true, the task will be executed by MasterAgent which can
   * delegate to specialized subagents (code-reviewer, data-analyst, security-auditor).
   */
  useDelegation: z.boolean().optional().describe('Enable MasterAgent delegation'),

  /**
   * Optional: Explicitly delegate to specific subagents without LLM planning.
   * When specified, MasterAgent will skip intelligent analysis and delegate directly.
   * This is more efficient than useDelegation which uses LLM planning.
   */
  delegateTo: z.array(z.string()).optional().describe('Explicit subagent delegation (bypasses LLM planning)'),

  /**
   * Optional: Environment configuration for task execution.
   * Key-value pairs that provide additional context for the task.
   * Common examples:
   * - workspace: "/path/to/project"
   * - gitUrl: "https://github.com/user/repo"
   * - language: "typescript" | "python" | "java"
   * - branch: "main" | "develop"
   * - framework: "react" | "nextjs" | "vue"
   * - Any other custom context needed for the task
   *
   * These environment variables are formatted and prepended to the user request
   * in the prompt, providing structured context without cluttering the task description.
   */
  environment: z.record(z.string(), z.any()).optional().describe('Environment configuration (workspace, gitUrl, language, etc.)'),

  /**
   * Optional: User ID for MyEcho integration (e.g., echo-abc123 for AI girlfriend).
   * Used for user profile accumulation and personalization.
   */
  userId: z.string().optional().describe('User ID (e.g., echo-abc123 for AI girlfriend)'),

  /**
   * Optional: User context for MyEcho integration.
   * Configuration bundle for AI girlfriend personality, relationship, and user preferences.
   */
  userContext: z.record(z.string(), z.any()).optional().describe('AI girlfriend configuration bundle'),

  /**
   * Optional: Directly specify a subagent to use.
   * When specified, the task will be executed directly by this subagent.
   */
  subagent: z.string().optional().describe('Specific subagent to use'),

  /**
   * Optional: Whether to rewrite the request using conversation history (default: true).
   * When false, the original request will be used as-is without context enhancement.
   * This is useful for integrations (e.g., MyEcho) that manage their own conversation context.
   */
  rewriteRequest: z.boolean().optional().describe('Enable request rewriting with conversation history (default: true)'),

  /**
   * Optional: Workflow name to execute.
   * When specified, uses the predefined workflow (sequence of agents) instead of LLM planning.
   * Workflow list can be fetched from /api/workflows endpoint.
   */
  workflow: z.string().optional().describe('Workflow name to execute'),

  /**
   * Optional: Workflow input parameters.
   * When specified with 'workflow', these parameters are passed directly to the workflow.
   * If not provided, the 'task' parameter will be used as a fallback (mapped to 'requirement' for simple_dev_workflow).
   */
  workflow_input: z.record(z.string(), z.any()).optional().describe('Workflow input parameters'),

  /**
   * Optional: Message ID for tracking conversation messages.
   * Used to link agent execution results with specific messages in external systems (e.g., MyEcho).
   * If not provided, a new messageId will be generated automatically.
   */
  messageId: z.string().optional().describe('Message ID for tracking (format: msg-{timestamp}-{random})'),
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
 *
 * IMPORTANT: To fix race condition where frontend queries task before it's persisted,
 * we create the task record in the database BEFORE emitting the event. This ensures
 * that when the frontend immediately queries /agent/result, the task will exist.
 */
export const handler = async (request: any, { emit, logger }: any) => {
  // Validate request body
  const validationResult = bodySchema.safeParse(request.body);
  if (!validationResult.success) {
    throw new Error(`Invalid request: ${validationResult.error.message}`);
  }

  const { task, sessionId, systemPrompt, availableSkills, app, useDelegation, delegateTo, environment, userId, userContext, subagent, rewriteRequest, workflow, workflow_input, messageId: providedMessageId } =
    validationResult.data;

  // Generate unique taskId with counter to prevent conflicts
  const taskId = `task-${Date.now()}-${++taskCounter}`;

  // Generate sessionId if not provided (for multi-turn conversations)
  const finalSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Determine messageId - use provided or generate new one
  const messageId = providedMessageId || MessageIdGenerator.generate();

  // Determine app identifier (default to 'default' if not provided)
  const appIdentifier = app || 'default';

  logger.info('Agent API: Received task request', {
    task,
    sessionId: finalSessionId,
    taskId,
    messageId,
    app: appIdentifier,
    skills: availableSkills,
    useDelegation,
    delegateTo,
    hasEnvironment: !!environment,
    environmentKeys: environment ? Object.keys(environment) : [],
    userId,
    hasUserContext: !!userContext,
    subagent,
    rewriteRequest,
  });

  // Log if no skills provided - PTCGenerator will handle selection
  if (!availableSkills || availableSkills.length === 0) {
    logger.info('No skills provided - PTCGenerator will auto-select skills', { taskId });
  }

  // CRITICAL: Create task record in database BEFORE emitting the event.
  // This prevents race condition where frontend queries /agent/result before
  // master-agent event handler persists the task.
  // The master-agent handler already has logic to check if task exists (lines 406-421)
  // to avoid duplicate creation on retries/re-emits.
  const store = getDataStore();
  await store.initialize(); // Ensure DB is initialized
  await store.createTask({
    id: taskId,
    task: task,
    app: appIdentifier,  // Store app in dedicated column
    sessionId: finalSessionId,
    userId: userId,  // ✅ userId 作为顶层属性，用于数据隔离 (Issue #65)
    status: TaskStatus.PENDING,
    metadata: {
      subagent, // 保存 subagent 信息用于后续多轮对话
      workflow, // 保存 workflow 信息
      environment, // 保存 environment 信息用于后续多轮对话
    },
  });
  logger.info('Task record created in database', { taskId, app: appIdentifier, status: 'PENDING', subagent, workflow, hasEnvironment: !!environment });

  // Emit agent task execution event
  // This will be picked up by the master-agent step
  await emit({
    topic: 'agent.task.execute',
    data: {
      taskId,
      task,
      sessionId: finalSessionId,
      messageId, // Message ID for tracking
      systemPrompt,
      availableSkills, // Pass through as-is (empty = let PTCGenerator decide)
      useDelegation,
      delegateTo, // Pass explicit delegation to MasterAgent
      environment, // Environment configuration for task context
      userId, // MyEcho: User ID for profile accumulation
      userContext, // MyEcho: User configuration bundle
      subagent, // MyEcho: Direct subagent selection
      rewriteRequest, // Request rewriting control (default: true)
      workflow, // Workflow name to execute (if specified)
      workflowInput: workflow_input, // Workflow input parameters (if specified)
    },
  } as any);

  // Return immediate response
  return {
    status: 200, // OK
    body: {
      success: true,
      message: useDelegation
        ? 'Task submitted for execution with MasterAgent delegation'
        : 'Task submitted for execution',
      taskId,
      messageId, // Return the actual messageId used (generated or provided)
      task,
      sessionId: finalSessionId,
      useDelegation,
      availableSkills,
      userId,
      subagent,
      rewriteRequest,
    },
  };
};
