/**
 * Master Agent Step (Production Implementation).
 *
 * This is the full production implementation that uses the global
 * AgentManager instance for session-scoped Agent instances.
 *
 * Features:
 * - Session-scoped Agent instances via AgentManager (imported from src/index.ts)
 * - Multi-turn conversation support
 * - Automatic session cleanup
 * - Configuration unified with application-wide settings
 */

import type { EventConfig } from 'motia';
import { z as _z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { agentManager } from '../../src/index';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';
import {
  TaskHookExecutor,
  DefaultTaskHook,
  ContextManagerTaskHook,
  UserAllowTaskHook,
  MetricsCollectorTaskHook,
  TaskTraceHook,
  UserProfileAccumulatorHook,
  TaskWorkspaceHook,
  TaskContext,
} from '../../src/core/task/hooks/index';
import { ContextManager } from '../../src/core/context/manager';
import {
  AgentMonitoringHook,
} from '../../src/core/agent/hooks/monitoring';
import {
  AgentContextSyncHook,
} from '../../src/core/agent/hooks/context-sync';
import {
  AgentProgressNotifyHook,
  setAgentStreams,
} from '../../src/core/agent/hooks/progress-notify';
import { AgentTraceHook } from '../../src/core/agent/hooks/trace-hook';
import { WorkflowEngine } from '../../src/core/workflow/engine';
import { getWorkflowLoader } from '../../src/core/workflow/loader';
import { getHookConfigLoader } from '../../src/core/task/hooks/hook-config-loader';
import type { AgentResult } from '../../src/core/agent/types';

/**
 * Input schema for Master Agent step.
 */
export const inputSchema = _z.object({
  /**
   * Task ID for tracking.
   */
  taskId: _z.string().optional(),

  /**
   * Task description to execute.
   */
  task: _z.string(),

  /**
   * Optional: Session ID for multi-turn conversations.
   * If not provided, a new session will be created.
   */
  sessionId: _z.string().optional(),

  /**
   * Optional: Whether to continue previous conversation.
   */
  continue: _z.boolean().optional(),

  /**
   * Optional: List of subagents for delegation.
   * When specified, delegates directly to these subagents without intelligent analysis.
   * When not specified, MasterAgent intelligently analyzes and decides.
   */
  delegateTo: _z.array(_z.string()).optional(),

  /**
   * Optional: System prompt override.
   */
  systemPrompt: _z.string().optional(),

  /**
   * Optional: Available skills.
   */
  availableSkills: _z.array(_z.string()).optional(),

  /**
   * Optional: Whether this is a retry of a previous task.
   */
  isRetry: _z.boolean().optional(),

  /**
   * Optional: User ID for MyEcho integration.
   * Used for user profile accumulation and personalization.
   */
  userId: _z.string().optional(),

  /**
   * Optional: User context for MyEcho integration.
   * Configuration bundle for AI girlfriend personality and user preferences.
   */
  userContext: _z.record(_z.string(), _z.any()).optional(),

  /**
   * Optional: Environment configuration for task execution.
   * Key-value pairs providing additional context (workspace, gitUrl, language, etc.).
   * These are formatted and prepended to the user request in the prompt.
   */
  environment: _z.record(_z.string(), _z.any()).optional(),

  /**
   * Optional: Direct subagent selection for MyEcho.
   * When specified, uses this subagent directly.
   */
  subagent: _z.string().optional(),

  /**
   * Optional: Whether to rewrite the request using conversation history (default: true).
   * When false, the original request will be used as-is without context enhancement.
   */
  rewriteRequest: _z.boolean().optional(),

  /**
   * Optional: Workflow input parameters.
   * When specified with workflow, these parameters are passed directly to the workflow.
   * If not provided, the task parameter will be used as a fallback.
   */
  workflowInput: _z.record(_z.string(), _z.any()).optional(),

  /**
   * Optional: Message ID for tracking conversation messages.
   * Links task execution results to specific messages in external systems (e.g., MyEcho).
   */
  messageId: _z.string().optional(),
});

/**
 * Master Agent Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute', 'agent.task.chat'],
  emits: ['agent.task.completed', 'agent.task.failed'],
  flows: ['agent-workflow'],
};

/**
 * Master Agent handler.
 *
 * This is the full production implementation that:
 * - Uses global AgentManager to acquire session-scoped Agent instances
 * - Supports multi-turn conversations via sessionId
 * - Returns sessionId for continued conversations
 * - Maintains session state (no release in finally)
 */
export const handler = async (
  input: any,
  { emit, logger, state: _state, streams: _streams }: any
) => {
  // === Initialize Configurable Hooks ===
  // Load hooks from hooks/ directory on first execution
  if (!(globalThis as any).motiaHooksLoaded) {
    try {
      const hookLoader = getHookConfigLoader();
      await hookLoader.loadFromDefaults();
      (globalThis as any).motiaHooksLoaded = true;
      logger.info('[MasterAgent] Configurable hooks loaded');
    } catch (error: any) {
      logger.warn('[MasterAgent] Failed to load configurable hooks:', error.message);
    }
  }

  // === 处理聊天消息 ===
  // 检查是否有 message 字段来判断是否是聊天事件
  // 注意：由于事件已经根据 subscribes 配置路由到这里，不需要检查 input.topic
  // 对于聊天事件，Motia 会将 emit({ topic: 'agent.task.chat', data }) 中的 data 传递给 handler
  const message = input.message || input.data?.message;

  if (message) {
    // 这是一个聊天事件
    const taskId = input.taskId || input.data?.taskId;
    const sessionId = input.sessionId || input.data?.sessionId;

    logger.info('Master Agent: Processing chat message', {
      taskId,
      sessionId,
      message: message.substring(0, 50),
    });

    // 如果没有sessionId，返回错误
    if (!sessionId) {
      logger.error('Chat message missing sessionId', { taskId });
      return {
        success: false,
        error: 'Session ID is required for chat messages',
      };
    }

    // === Agent Hook Setup ===
    // Set streams for progress notifications
    setAgentStreams(_streams);

    // Get hook manager
    const hookManager = agentManager.getHookManager();

    try {
      // 获取Agent实例
      const agent = await agentManager.acquire(sessionId, {
        agentType: 'master',
      });

      logger.info('Agent acquired for chat', {
        sessionId,
        agentType: agent.constructor.name,
      });

      // Set hookManager to agent so it can trigger its own hooks
      if (agent.setHookManager) {
        agent.setHookManager(hookManager);
        logger.info('HookManager set on agent for chat', { sessionId });
      }

      // 获取上下文
      const contextManager = new ContextManager();
      const context = await contextManager.getContext(taskId);

      // ⭐ 使用新的方法获取对话历史
      // 如果 context 为 null，创建一个临时的空上下文
      const taskContext = context || {
        taskId,
        sessionId,
        conversationRounds: [],
        summary: {
          sessionIntent: '',
          currentTask: message,
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'pending',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        skillExecutionHistory: [],
        toolUsageHistory: [],
        workingMemory: {},
        metadata: {},
      };
      const conversationHistory = contextManager.getConversationHistoryForAgent(taskContext);
      (context as any).conversationHistory = conversationHistory;

      logger.debug('[master-agent.chat] conversationHistory loaded:', {
        taskId,
        conversationHistoryLength: conversationHistory.length,
        conversationRoundsLength: taskContext.conversationRounds.length,
        conversationHistoryPreview: conversationHistory.map((h: any) => `${h.role}: ${h.content.substring(0, 20)}`).join(', '),
      });

      // 添加 agent 相关信息到 context
      // 这确保 hooks 和 agent.run() 能够访问 agentType 和 agent 实例
      const agentTypeName = agent.constructor.name;
      (context as any).agentType = agentTypeName;
      (context as any).agent = agent;

      logger.info('Context loaded for chat', {
        taskId,
        conversationHistoryLength: conversationHistory.length,
        agentType: agentTypeName,
      });

      // 构造聊天提示词（使用 conversationHistory）
      // Agent.run() 会使用 conversationHistory 构建对话上下文
      const chatPrompt = message;

      // 触发Agent Hook: onTaskStart
      // ⚠️ 传递 message（用户消息）而不是 chatPrompt（完整上下文）
      // 避免在通知中包含完整的对话历史
      await hookManager.executeHook(
        'onTaskStart',
        message,
        taskId,
        context
      );

      // 执行Agent回复
      logger.info('Agent starting chat response', { taskId, sessionId });

      // Update LLM trace configuration
      agent.updateLLMTraceConfig(taskId);

      const result = await agent.run(chatPrompt, taskId, context);

      logger.info('Agent chat response completed', {
        taskId,
        success: result.success,
        hasOutput: !!result.output,
      });

      // 触发Agent Hook: onTaskComplete
      await hookManager.executeHook(
        'onTaskComplete',
        result,
        context
      );

      // 发送回复到Stream
      const timestamp = Date.now();
      const uniqueId = `${taskId}-chat-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;

      // 处理不同格式的输出
      logger.info('处理Agent回复', {
        taskId,
        outputType: typeof result.output,
        hasOutput: !!result.output,
        outputPreview: result.output ? (typeof result.output === 'string' ? result.output.substring(0, 100) : JSON.stringify(result.output).substring(0, 100)) : 'undefined'
      });

      let rawContent = '抱歉，我没有生成回复。';
      if (typeof result.output === 'string') {
        // 如果 output 是字符串，直接使用
        rawContent = result.output;
      } else if (result.output?.text) {
        rawContent = result.output.text;
      } else if (result.output?.content) {
        rawContent = result.output.content;
      }

      // 过滤掉DEBUG信息，只保留实际回复内容
      let responseContent = rawContent
        .split('\n')
        .filter(line => {
          // 过滤掉DEBUG信息
          if (line.trim().startsWith('[DEBUG]')) return false;
          // 过滤掉成功消息
          if (line.trim().startsWith('success=True')) return false;
          // 过滤掉SkillHookExecutor消息
          if (line.includes('SkillHookExecutor')) return false;
          // 过滤掉空行
          if (line.trim() === '') return false;
          return true;
        })
        .join('\n')
        .trim();

      // 如果过滤后内容为空，使用原始内容
      if (!responseContent) {
        responseContent = rawContent;
      }

      logger.info('提取的回复内容', {
        taskId,
        originalLength: rawContent.length,
        filteredLength: responseContent.length,
        contentPreview: responseContent.substring(0, 100)
      });

      await _streams.taskExecution.set(taskId, uniqueId, {
        progressType: 'chat',
        type: 'chat',
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(timestamp).toISOString(),
        metadata: {
          data: {
            message: responseContent,
            sender: 'assistant'
          }
        }
      });

      logger.info('Chat response sent to stream', { taskId, uniqueId });

      // ⭐ 注意：我们不再使用 addMessage，改用 conversationRounds
      // ConversationRound 将由 ContextManagerTaskHook.postExec 保存

      logger.info('Chat messages completed', { taskId });

      return {
        success: true,
        taskId,
        sessionId,
        response: responseContent,
      };
    } catch (error: any) {
      logger.error('Chat processing failed', {
        error: error.message,
        stack: error.stack,
        taskId,
        sessionId,
      });

      // 发送错误消息到Stream
      const timestamp = Date.now();
      const uniqueId = `${taskId}-chat-error-${timestamp}`;
      await _streams.taskExecution.set(taskId, uniqueId, {
        progressType: 'chat',
        type: 'error',
        role: 'assistant',
        content: `抱歉，处理消息时出错: ${error.message}`,
        timestamp: new Date(timestamp).toISOString(),
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ===  如果指定了 subagent，转换为 delegateTo 以直接执行 ===
  // 这样可以绕过 LLM 规划，直接使用指定的 subagent
  if (input.subagent && (!input.delegateTo || input.delegateTo.length === 0)) {
    input.delegateTo = [input.subagent];
    logger.info('[MyEcho] Converted subagent to delegateTo for direct execution', {
      subagent: input.subagent,
      delegateTo: input.delegateTo,
    });
  }

  // === Workflow Execution Check ===
  // Store workflow info for later use
  // We'll execute workflow instead of agent.run(), but still go through all hooks
  if (input.workflow) {
    logger.info('[MasterAgent] Workflow specified', {
      workflow: input.workflow,
      task: input.task,
      taskId: input.taskId || 'unknown',
    });
    (input as any).workflowName = input.workflow;
    (input as any).workflowInput = input.workflowInput;
  }

  // === 处理正常任务执行（现有代码）===
  // Get or create sessionId
  const sessionId = input.sessionId || uuidv4();
  const taskId = input.taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  logger.info('Master Agent: Starting task execution', {
    task: input.task,
    sessionId,
    taskId,
    messageId: input.messageId,  // Log messageId for debugging
  });

  // === Agent Hook Setup ===
  // Set streams for progress notifications
  setAgentStreams(_streams);

  // Register Agent hooks
  const hookManager = agentManager.getHookManager();
  if (hookManager.getHookCount() === 0) {
    // Only register hooks once
    hookManager.register(new AgentMonitoringHook({
      logMetrics: true,
      trackPerformance: true,
    }));
    hookManager.register(new AgentContextSyncHook({
      persistAfterTask: true,
      restoreOnAcquire: true,
    }));
    hookManager.register(new AgentProgressNotifyHook({
      notifyOnAcquire: true,
      notifyOnTaskStart: true,
      notifyOnTaskComplete: true,
    }));
    hookManager.register(new AgentTraceHook());
    logger.info('Agent hooks registered', {
      hookCount: hookManager.getHookCount(),
    });
  }

  // === TaskHook Setup ===
  const taskHookExecutor = new TaskHookExecutor();

  // Register default hooks
  taskHookExecutor.registerHook(new DefaultTaskHook());
  taskHookExecutor.registerHook(new ContextManagerTaskHook());
  taskHookExecutor.registerHook(new UserAllowTaskHook());
  taskHookExecutor.registerHook(new MetricsCollectorTaskHook());
  taskHookExecutor.registerHook(new TaskTraceHook());
  taskHookExecutor.registerHook(new UserProfileAccumulatorHook()); // MyEcho: 用户画像累积
  taskHookExecutor.registerHook(new TaskWorkspaceHook()); // Workspace: 清理 task 级别的 workspace

  // Register configurable hooks from global executor (loaded from hooks/ directory)
  if ((globalThis as any).motiaTaskHookExecutor) {
    const globalExecutor = (globalThis as any).motiaTaskHookExecutor as TaskHookExecutor;
    // Get hooks from global executor and register them
    const globalHooks = (globalExecutor as any).hooks || [];
    for (const hook of globalHooks) {
      taskHookExecutor.registerHook(hook);
      logger.info('[MasterAgent] Registered configurable hook', { hookName: hook.name || hook.constructor.name });
    }
  }

  // Build TaskContext
  const taskContext: TaskContext = {
    taskId,
    sessionId,
    task: input.task,
    originalTask: input.task,  // 保存原始任务（不含对话历史）
    status: 'pending',
    context: null,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      llmCalls: 0,
      skillCalls: 0,
      totalTokens: 0,
      userId: input.userId, // MyEcho: Pass userId for profile accumulation
      userContext: input.userContext, // MyEcho: Pass userContext
      environment: input.environment, // Environment configuration for task context
      subagent: input.subagent, // MyEcho: Pass subagent selection
      rewriteRequest: input.rewriteRequest !== undefined ? input.rewriteRequest : true, // Request rewriting control (default: true)
    },
    services: {
      streams: _streams,
      logger,
      emit,
    },
  } as any; // 使用 any 因为我们要添加额外的 agentType 字段

  // Initialize data store and create task record
  const store = getDataStore();

  // 检查任务是否已存在（可能因为 BullMQ 重试或多轮对话）
  const existingTask = await store.getTask(taskId).catch(() => null);
  if (existingTask) {
    logger.info('Task already exists in database, skipping creation', {
      taskId,
      existingStatus: existingTask.status,
    });
    // 如果任务已存在且没有提供 subagent，从 metadata 中恢复 subagent
    // 这确保多轮对话使用相同的 subagent
    if (!input.subagent && existingTask.metadata?.subagent) {
      input.subagent = existingTask.metadata.subagent as string;
      logger.info('Master Agent: Restored subagent from task metadata', {
        taskId,
        subagent: input.subagent,
      });
    }
    // 如果任务已存在且没有提供 environment，从 metadata 中恢复 environment
    // 这确保多轮对话使用相同的 environment
    if (!input.environment && existingTask.metadata?.environment) {
      input.environment = existingTask.metadata.environment as Record<string, any>;
      logger.info('Master Agent: Restored environment from task metadata', {
        taskId,
        environmentKeys: Object.keys(input.environment),
      });
    }
  } else {
    await store.createTask({
      id: taskId,
      task: input.task,
      sessionId: sessionId,
      status: TaskStatus.PENDING,
      metadata: {
        subagent: input.subagent, // 保存 subagent 信息用于后续多轮对话
        environment: input.environment, // 保存 environment 信息用于后续多轮对话
      },
    });
    logger.info('Task record created in database', {
      taskId,
      status: 'PENDING',
      subagent: input.subagent,
      hasEnvironment: !!input.environment,
    });
  }

  // Helper function to update stream
  // DISABLED: Stream updates cause stack overflow due to wrapObject bug
  // See: docs/websocket-stream-analysis.md
  const updateStream = async (status: string, data?: any) => {
    try {
      // Only log to console, don't update stream
      logger.debug(`[${status}] ${taskId}`, {
        task: input.task,
        sessionId,
        timestamp: new Date().toISOString(),
        ...data,
      });

      // Stream update disabled to prevent stack overflow
      // await streams.taskExecution.set(taskId, taskId, {
      //   taskId,
      //   task: input.task,
      //   status,
      //   sessionId,
      //   timestamp: new Date().toISOString(),
      //   ...data,
      // });
    } catch (error) {
      logger.warn('Failed to log stream update', { error });
    }
  };

  // Set initial status to pending
  await updateStream('pending', { currentStep: 'Initializing' });

  try {
    // === Execute pre-hooks ===
    logger.info('Executing pre-execution hooks', { taskId });
    const preResult = await taskHookExecutor.executePreHooks(taskContext);

    if (preResult.stop) {
      logger.warn('Task stopped by pre-hook', { taskId, reason: preResult.reason });
      await emit({
        topic: 'agent.task.failed',
        data: { taskId, sessionId, messageId: input.messageId, error: preResult.reason },
      } as any);
      return {
        success: false,
        taskId,
        sessionId,
        error: preResult.reason,
      };
    }

    // Update task if modified by hooks
    if (preResult.modifiedTask) {
      taskContext.task = preResult.modifiedTask;
      logger.info('Task modified by hook', { taskId, modifiedTask: preResult.modifiedTask });
    }

    taskContext.status = 'running';

    // Update status to running
    await updateStream('running', { currentStep: 'Acquiring agent' });

    // Always use MasterAgent for all requests
    logger.info('Acquiring MasterAgent', {
      sessionId,
      delegateTo: input.delegateTo,
      availableSkills: input.availableSkills,
      skillCount: input.availableSkills?.length || 0
    });

    logger.debug('[master-agent.step] Input received:', {
      taskId,
      sessionId,
      'input.delegateTo': input.delegateTo,
      'input.availableSkills': input.availableSkills,
    });

    // Get MasterAgent from Manager
    // each session has independent MasterAgent instance
    // Hook: onAgentCreate and onAgentAcquire are called here
    // Note: Only pass availableSkills if it's a non-empty array
    // Empty array means "use all skills" (not "restrict to no skills")
    const acquireOptions: any = {
      agentType: 'master',
    };
    if (input.availableSkills && input.availableSkills.length > 0) {
      acquireOptions.availableSkills = input.availableSkills;
    }
    if (input.delegateTo && input.delegateTo.length > 0) {
      acquireOptions.delegateTo = input.delegateTo;
      logger.debug('[master-agent.step] Added delegateTo to acquireOptions:', input.delegateTo);
    } else {
      logger.debug('[master-agent.step] No delegateTo in input or empty array');
    }

    logger.debug('[master-agent.step] Calling agentManager.acquire with options:', acquireOptions);

    const agent = await agentManager.acquire(sessionId, acquireOptions);

    // Verify agent type
    const agentTypeName = agent.constructor.name;
    logger.info('Agent acquired', {
      sessionId,
      agentType: agentTypeName,
      isMasterAgent: agentTypeName === 'MasterAgent',
    });

    // Set hookManager to agent so it can trigger its own hooks
    // This allows subagents to also record traces when they execute
    if (agent.setHookManager) {
      agent.setHookManager(hookManager);
      logger.info('HookManager set on agent', { sessionId });
    }

    // 设置 taskContext 的 agentType，供 hook 使用
    (taskContext as any).agentType = agentTypeName;

    // 初始化 taskContext.context 并添加 agent 相关信息
    // 这确保 hooks 和 agent.run() 能够访问 agentType 和 agent 实例
    if (!taskContext.context) {
      taskContext.context = {
        taskId: '',
        sessionId: '',
        conversationRounds: [],
        summary: null,
        artifactIndex: [],
        skillExecutionHistory: [],
        toolUsageHistory: [],
        workingMemory: {},
        metadata: {},
      };
    }
    (taskContext.context as any).agentType = agentTypeName;
    (taskContext.context as any).agent = agent;
    (taskContext.context as any).rewriteRequest = input.rewriteRequest !== undefined ? input.rewriteRequest : true; // Pass rewriteRequest to agent
    // Pass emit function to Agent for event emission
    (taskContext.context as any).emit = emit;

    // ⭐ 关键修复：将 userContext 从 metadata 复制到 workingMemory
    // 这样 Agent.buildEnhancedSystemPrompt() 和 Orchestrator 都能找到它
    if (input.userContext) {
      (taskContext.context as any).workingMemory.userContext = input.userContext;
      logger.info('[master-agent.step] userContext copied to workingMemory', {
        hasName: !!input.userContext.name,
        hasPersonality: !!input.userContext.personality,
      });
    }

    // ⭐ 将 environment 从 input 复制到 context
    // 这样 Orchestrator 能够找到它并传递给 PTCGenerator
    if (input.environment) {
      (taskContext.context as any).environment = input.environment;
      logger.info('[master-agent.step] environment copied to context', {
        keys: Object.keys(input.environment),
      });
    }

    // 注意：formattedHistory 将在获取上下文后设置（见下文 taskWithContext 定义后）

    logger.info('[master-agent.step] rewriteRequest setting:', {
      'input.rewriteRequest': input.rewriteRequest,
      'context.rewriteRequest': (taskContext.context as any).rewriteRequest,
    });

    await updateStream('running', {
      currentStep: `${agentTypeName} acquired, starting execution`,
    });

    // If continuing conversation, get history
    if (input.continue) {
      const agentState = agent.getState();
      logger.info('Continuing conversation', {
        sessionId,
        conversationLength: agentState.conversationHistory.length,
      });
      await updateStream('running', {
        currentStep: `Continuing conversation (${agentState.conversationHistory.length} messages)`,
      });
    }

    // Execute task (Agent maintains session state)
    await updateStream('running', { currentStep: 'Executing task' });
    logger.info('About to call agent.run()', { sessionId, task: input.task, taskId });

    // Update task status to RUNNING
    // For multi-turn conversations (input.continue), allow resetting from completed to running
    const currentTask = await store.getTask(taskId);
    const isContinuation = input.continue === true;

    if (currentTask && currentTask.status !== 'completed') {
      await store.updateTask(taskId, { status: TaskStatus.RUNNING });
      logger.info('Task status updated to RUNNING', { taskId });
    } else if (currentTask && currentTask.status === 'completed') {
      if (isContinuation) {
        // Allow continuing from completed status for multi-turn conversations
        await store.updateTask(taskId, { status: TaskStatus.RUNNING });
        logger.info('Task status reset to RUNNING for continuation', { taskId });
      } else {
        logger.warn('Task already completed, not resetting status to RUNNING', { taskId });
      }
    }

    // === 获取历史上下文 ===
    // ⭐ TaskHook.preExec 已经加载了 conversationHistory
    // conversationHistory 存储在 taskContext.conversationHistory（不是 taskContext.context.conversationHistory）
    if (!(taskContext as any).conversationHistory) {
      const contextManager = new ContextManager();
      const conversationHistory = taskContext.context
        ? contextManager.getConversationHistoryForAgent(taskContext.context)
        : [];
      (taskContext as any).conversationHistory = conversationHistory;
      logger.debug('[master-agent] Loaded conversationHistory from ContextManager:', {
        taskId,
        conversationHistoryLength: conversationHistory.length,
      });
    } else {
      logger.debug('[master-agent] conversationHistory already exists from preExec:', {
        taskId,
        conversationHistoryLength: (taskContext as any).conversationHistory.length,
      });
    }

    // 保存原始任务（用于传递给 Agent.run）
    const originalTaskForAgent = input.task;

    // 添加原始任务到 context
    (taskContext.context as any).originalTask = input.task;

    logger.info('Conversation history loaded', {
      taskId,
      conversationHistoryLength: (taskContext as any).conversationHistory?.length || 0,
    });

    // === Agent Hook: onTaskStart ===
    // ⚠️ 传递原始任务（input.task）而不是 taskWithContext（包含对话历史）
    // 避免在通知中包含完整的对话历史
    await hookManager.executeHook('onTaskStart', input.task, taskId, taskContext.context);
    logger.info('Agent onTaskStart hook executed', { taskId });

    // === Start progressing hooks ===
    taskHookExecutor.startProgressingHooks(taskContext);
    logger.info('Progressing hooks started', { taskId });

    // Update LLM trace configuration
    agent.updateLLMTraceConfig(taskId);

    // ⭐ 将 conversationHistory 从 taskContext 复制到 taskContext.context
    // 因为 agent.run() 接收 context 参数，期望 context.conversationHistory 存在
    if ((taskContext as any).conversationHistory) {
      (taskContext.context as any).conversationHistory = (taskContext as any).conversationHistory;
      logger.debug('[master-agent] Copied conversationHistory to context:', {
        taskId,
        conversationHistoryLength: (taskContext.context as any).conversationHistory.length,
      });
    }

    // ⭐ 传递原始任务（而不是格式化的 taskWithContext）给 Agent.run()
    // 格式化的对话历史已经在 context.formattedHistory 中

    // === Workflow vs Normal Agent Execution ===
    let result: AgentResult;
    if ((input as any).workflowName) {
      // Execute workflow
      logger.info('[MasterAgent] Executing workflow', {
        workflow: (input as any).workflowName,
        taskId,
      });

      // Get or create workflow engine
      if (!(globalThis as any).motiaWorkflowEngine) {
        (globalThis as any).motiaWorkflowEngine = new WorkflowEngine(agentManager);
        const workflowLoader = getWorkflowLoader((globalThis as any).motiaWorkflowEngine);
        await workflowLoader.loadFromDefaults();
        logger.info('[MasterAgent] Workflow engine initialized');
      }
      const workflowEngine = (globalThis as any).motiaWorkflowEngine;

      // List all registered workflows for debugging
      const registeredWorkflows = workflowEngine.listWorkflows();
      logger.info('[MasterAgent] Registered workflows', {
        count: registeredWorkflows.length,
        names: registeredWorkflows.map((w: { name: string }) => w.name),
        requestedWorkflow: (input as any).workflowName,
      });

      // Execute workflow
      // Build workflow input: use workflowInput if provided, otherwise fallback to { requirement: input.task }
      const workflowInput = (input as any).workflowInput || { requirement: input.task };
      logger.info('[MasterAgent] Workflow input prepared', {
        workflow: (input as any).workflowName,
        hasWorkflowInput: !!(input as any).workflowInput,
        inputKeys: Object.keys(workflowInput),
      });

      // Get workflow definition and send step plan notification
      const workflowDef = (globalThis as any).motiaWorkflowEngine?.getWorkflow((input as any).workflowName);
      if (workflowDef && workflowDef.steps) {
        const timestamp = Date.now();
        const uniqueId = `${taskId}-workflow-${timestamp}`;
        const stepsList = workflowDef.steps.map((s: any) => `- ${s.name || s.id} (${s.agent})`).join('\n');

        await _streams.taskExecution.set(taskId, uniqueId, {
          progressType: 'workflow',
          type: 'info',
          role: 'system',
          status: 'started',
          content: `执行工作流: ${workflowDef.name || (input as any).workflowName}\n\n${stepsList}`,
          timestamp: new Date(timestamp).toISOString(),
          metadata: {
            workflow: (input as any).workflowName,
            stepCount: workflowDef.steps.length,
          },
        });
        logger.info('[MasterAgent] Workflow step plan sent to stream', {
          workflow: (input as any).workflowName,
          stepCount: workflowDef.steps.length,
        });
      }

      const workflowResult = await workflowEngine.execute(
        (input as any).workflowName,
        workflowInput,
        { taskId, parentSessionId: sessionId }
      );

      // Convert workflow result to AgentResult format
      // workflowResult.output is the structuredOutput from the last agent step
      const workflowStructuredOutput = workflowResult.output;

      // Extract artifactType from structuredOutput (same logic as agent)
      const artifactType = workflowStructuredOutput?.result_type
        ? ({
            code: 'code',
            infographic: 'image',
            video: 'video',
            image: 'image',
            audio: 'audio',
            table: 'table',
          } as Record<string, string>)[workflowStructuredOutput.result_type] || workflowStructuredOutput.result_type
        : null;

      result = {
        success: workflowResult.success,
        output: JSON.stringify(workflowStructuredOutput),  // Store as JSON string for compatibility
        structuredOutput: workflowStructuredOutput,        // Set structuredOutput for proper artifact detection
        error: workflowResult.error,
        executionTime: workflowResult.executionTime,
        metadata: {
          workflow: (input as any).workflowName,
          artifactType: artifactType,  // Add artifactType to metadata
          ...workflowResult.context,
        },
      } as any;

      logger.info('[MasterAgent] Workflow execution completed', {
        workflow: (input as any).workflowName,
        success: result.success,
        taskId,
        'result keys': Object.keys(result),
        'result.output': result.output,
        'result.metadata': result.metadata,
      });

      // Detailed logging for workflow result
      logger.debug('[MasterAgent] Workflow result details:', {
        workflow: (input as any).workflowName,
        success: result.success,
        hasOutput: !!result.output,
        outputKeys: result.output ? Object.keys(result.output) : [],
        output: result.output,
        contextKeys: result.metadata ? Object.keys(result.metadata) : [],
        hasVariablesInContext: (result.metadata as any)?.variables !== undefined,
        variables: (result.metadata as any)?.variables,
      });
    } else {
      // Normal agent execution
      result = await agent.run(originalTaskForAgent, taskId, taskContext.context);
    }

    // 调试：立即检查 result 的内容
    logger.debug('[master-agent] Got result from agent.run():', {
      taskId,
      'result keys': Object.keys(result),
      'result has structuredOutputs': 'structuredOutputs' in result,
      'result.structuredOutputs': (result as any).structuredOutputs,
    });

    // === HITL Checkpoint: Handle awaiting clarification status ===
    if (result.error === 'AWAITING_CLARIFICATION' && result.clarification) {
      logger.info('Task awaiting clarification', { taskId, question: result.clarification.question });

      // Update task status to awaiting_clarification using DataStore
      try {
        const dataStore = getDataStore();
        await dataStore.initialize();
        await dataStore.updateTask(taskId, { status: TaskStatus.AWAITING_CLARIFICATION });
        logger.info('Task status updated to awaiting_clarification', { taskId });
      } catch (dbError: any) {
        logger.error('Failed to update task status', { taskId, error: dbError.message });
      }

      // Update stream with awaiting_clarification status
      // Stream provides real-time push to frontend subscribers
      await updateStream('awaiting_clarification', {
        clarification: result.clarification,
        currentStep: 'Awaiting user clarification',
        metadata: result.metadata,
      });

      return {
        success: false,
        awaitingClarification: true,
        clarification: result.clarification,
        taskId,
        sessionId
      };
    }

    // Fallback: Read structuredOutput from file if Agent didn't return it
    if (!result.structuredOutput || Object.keys(result.structuredOutput).length === 0) {
      const fs = await import('fs');
      const structuredOutputPath = `/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json`;

      if (fs.existsSync(structuredOutputPath)) {
        try {
          const fileContent = await fs.promises.readFile(structuredOutputPath, 'utf-8');
          result.structuredOutput = JSON.parse(fileContent);
          logger.info('[master-agent] Loaded structuredOutput from file', {
            taskId,
            resultType: result.structuredOutput?.result_type,
          });
        } catch (error: any) {
          logger.warn('[master-agent] Failed to read structuredOutput from file', {
            taskId,
            error: error.message,
          });
        }
      }
    }

    logger.info('Task execution completed', {
      sessionId,
      success: result.success,
      executionTime: result.executionTime,
      delegates: result.metadata.delegates,  // Show which subagents were used
    });

    // === Stop progressing hooks ===
    taskHookExecutor.stopProgressingHooks();
    logger.info('Progressing hooks stopped', { taskId });

    // === Agent Hook: onTaskComplete ===
    await hookManager.executeHook('onTaskComplete', result, {
      ...taskContext.context,
      sessionId,
      taskId,
    });
    logger.info('Agent onTaskComplete hook executed', { taskId });

    // === Execute post-hooks ===
    logger.info('Executing post-execution hooks', { taskId });
    taskContext.status = result.success ? 'completed' : 'failed';
    await taskHookExecutor.executePostHooks(taskContext, {
      success: result.success,
      executionTime: result.executionTime,
      output: result.output,
      error: result.error,
      metadata: result.metadata,
    });

    // Update stream with completed status
    await updateStream('completed', {
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      currentStep: 'Task completed',
      metadata: result.metadata,
    });

    // Emit completion event
    // 调试：检查 result.structuredOutputs
    logger.debug('[master-agent] About to emit completion event:', {
      taskId,
      'result keys': Object.keys(result),
      'result.structuredOutputs': (result as any).structuredOutputs,
      'result.structuredOutputs type': Array.isArray((result as any).structuredOutputs) ? 'array' : typeof (result as any).structuredOutputs,
      'result.structuredOutputs length': (result as any).structuredOutputs?.length,
      'result has structuredOutputs': 'structuredOutputs' in result,
    });

    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        messageId: input.messageId,  // Pass through messageId for tracking
        task: input.task,
        result: {
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime,
          state: result.state,
          metadata: result.metadata,
          structuredOutput: result.structuredOutput, // Structured output at root level
          structuredOutputs: (result as any).structuredOutputs, // All structured outputs
        },
      },
    });

    // Return sessionId so client can continue conversation
    return {
      success: true,
      sessionId,
      taskId,
      output: result.output,
      state: result.state,
      metadata: result.metadata,  // Include metadata with delegates info
      structuredOutput: result.structuredOutput, // Structured output at root level
    };
  } catch (error: any) {
    logger.error('Agent execution failed', {
      error: error.message,
      stack: error.stack,
      sessionId,
    });

    // === Clean up hooks on error ===
    taskHookExecutor.stopProgressingHooks();
    taskContext.status = 'failed';

    // Execute post-hooks even on failure
    await taskHookExecutor.executePostHooks(taskContext, {
      success: false,
      error: error.message,
      executionTime: 0,
    });

    // Update stream with failed status
    await updateStream('failed', {
      error: error.message,
      currentStep: 'Task failed',
    });

    // Emit failure event
    await emit({
      topic: 'agent.task.failed',
      data: {
        taskId,
        sessionId,
        messageId: input.messageId,  // Pass through messageId for tracking
        task: input.task,
        error: error.message,
        stack: error.stack,
      },
    });

    throw error;
  } finally {
    // Keep session alive - don't release!
    // Manager will automatically cleanup expired sessions
    // await agentManager.release(sessionId);
  }
};
