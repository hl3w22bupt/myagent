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
  TaskContext,
} from '../../src/core/task/hooks/index';
import { ContextManager } from '../../src/core/context/manager';
import {
  AgentMonitoringHook,
  AgentContextSyncHook,
  AgentProgressNotifyHook,
  setAgentStreams,
} from '../../src/core/agent/hooks';

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
   * Optional: Use MasterAgent with delegation.
   * When true, creates MasterAgent instance instead of regular Agent.
   */
  useDelegation: _z.boolean().optional(),

  /**
   * Optional: List of subagents for delegation (requires useDelegation=true).
   */
  subagents: _z.array(_z.string()).optional(),

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
  input: _z.infer<typeof inputSchema>,
  { emit, logger, state: _state, streams: _streams }: any
) => {
  // === 处理聊天消息 ===
  if (input.topic === 'agent.task.chat') {
    const { taskId, sessionId, message } = input.data;

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

      // 获取上下文
      const contextManager = new ContextManager();
      const context = await contextManager.getContext(taskId);
      const contextStr = await contextManager.getContextForLLM(taskId);

      logger.info('Context loaded for chat', {
        taskId,
        hasContext: !!contextStr,
        contextLength: contextStr?.length || 0,
      });

      // 构造聊天提示词
      const chatPrompt = contextStr
        ? `## Conversation History\n${contextStr}\n\n## User Message\n${message}`
        : message;

      // 触发Agent Hook: onTaskStart
      await hookManager.executeHook(
        'onTaskStart',
        chatPrompt,
        taskId,
        context
      );

      // 执行Agent回复
      logger.info('Agent starting chat response', { taskId, sessionId });
      const result = await agent.run(chatPrompt, taskId, context);

      logger.info('Agent chat response completed', {
        taskId,
        success: result.success,
        hasResponse: !!(result.response || result.text),
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
      const responseContent = result.response || result.text || '抱歉，我没有生成回复。';

      await _streams.taskExecution.set(taskId, uniqueId, {
        progressType: 'chat',
        type: 'chat',
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(timestamp).toISOString(),
      });

      logger.info('Chat response sent to stream', { taskId, uniqueId });

      // 保存用户消息到上下文
      await contextManager.addMessage(context, {
        role: 'user',
        content: message,
        metadata: { timestamp: new Date() },
      });

      // 保存Agent回复到上下文
      await contextManager.addMessage(context, {
        role: 'assistant',
        content: responseContent,
        metadata: { timestamp: new Date() },
      });

      logger.info('Chat messages saved to context', { taskId });

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

  // === 处理正常任务执行（现有代码） ===
  // Get or create sessionId
  const sessionId = input.sessionId || uuidv4();
  const taskId = input.taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  logger.info('Master Agent: Starting task execution', {
    task: input.task,
    sessionId,
    taskId,
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
    logger.info('Agent hooks registered', {
      hookCount: hookManager.getHookCount(),
    });
  }

  // === TaskHook Setup ===
  const taskHookExecutor = new TaskHookExecutor();
  taskHookExecutor.registerHook(new DefaultTaskHook());
  taskHookExecutor.registerHook(new ContextManagerTaskHook());
  taskHookExecutor.registerHook(new UserAllowTaskHook());
  taskHookExecutor.registerHook(new MetricsCollectorTaskHook());

  // Build TaskContext
  const taskContext: TaskContext = {
    taskId,
    sessionId,
    task: input.task,
    status: 'pending',
    context: null,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      llmCalls: 0,
      skillCalls: 0,
      totalTokens: 0,
    },
    services: {
      streams: _streams,
      logger,
      emit,
    },
  };

  // Initialize data store and create task record
  const store = getDataStore();

  // 检查任务是否已存在（可能因为 BullMQ 重试）
  const existingTask = await store.getTask(taskId).catch(() => null);
  if (existingTask) {
    logger.info('Task already exists in database, skipping creation', {
      taskId,
      existingStatus: existingTask.status,
    });
  } else {
    await store.createTask({
      id: taskId,
      task: input.task,
      sessionId: sessionId,
      status: TaskStatus.PENDING,
    });
    logger.info('Task record created in database', { taskId, status: 'PENDING' });
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
        data: { taskId, sessionId, error: preResult.reason },
      });
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

    // Determine agent type
    const useMasterAgent = input.useDelegation || false;
    const agentType = useMasterAgent ? 'master' : 'agent';

    logger.info('Acquiring agent', { sessionId, agentType, useDelegation: useMasterAgent });

    // Get Agent or MasterAgent from Manager
    // each session has independent Agent/MasterAgent instance
    // Hook: onAgentCreate and onAgentAcquire are called here
    const agent = await agentManager.acquire(sessionId, {
      agentType,
    });

    // Verify agent type
    const agentTypeName = agent.constructor.name;
    logger.info('Agent acquired', {
      sessionId,
      agentType: agentTypeName,
      isMasterAgent: agentTypeName === 'MasterAgent',
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
    await store.updateTask(taskId, { status: TaskStatus.RUNNING });
    logger.info('Task status updated to RUNNING', { taskId });

    // === 获取历史上下文 ===
    const contextManager = new ContextManager();
    const contextStr = await contextManager.getContextForLLM(taskId);

    // 将上下文添加到任务描述中
    const taskWithContext = contextStr
      ? `## Conversation History\n${contextStr}\n\n## Current Task\n${taskContext.task}`
      : taskContext.task;

    if (contextStr) {
      logger.info('Loaded conversation history for task', {
        taskId,
        contextLength: contextStr.length,
      });
    }

    taskContext.task = taskWithContext; // 更新任务描述

    // === Agent Hook: onTaskStart ===
    await hookManager.executeHook('onTaskStart', taskContext.task, taskId, taskContext.context);
    logger.info('Agent onTaskStart hook executed', { taskId });

    // === Start progressing hooks ===
    taskHookExecutor.startProgressingHooks(taskContext);
    logger.info('Progressing hooks started', { taskId });

    const result = await agent.run(taskContext.task, taskId, taskContext.context);

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
    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        task: input.task,
        result: {
          success: result.success,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime,
          state: result.state,
          metadata: result.metadata,
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
