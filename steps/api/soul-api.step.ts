/**
 * Soul API - Execute Soul Trigger
 *
 * 遵循 Master Agent 的相同模式：
 * 1. 创建 task 记录（status: PENDING）
 * 2. 直接执行 Soul Agent（设置 streams）
 * 3. 发送 agent.task.completed 事件
 * 4. task-result-handler 等订阅者处理并保存所有数据
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { ApiRouteConfig } from 'motia';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';
import { setAgentStreams } from '../../src/core/agent/hooks/progress-notify';

/**
 * Soul Execute API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'soul-execute',
  description: 'Execute Soul Agent with trigger context',

  path: '/api/soul/:soulId/execute',
  method: 'POST',

  // ✅ 发送 completion 事件
  emits: ['agent.task.completed', 'agent.task.failed'],
  flows: ['agent-workflow'],
};

/**
 * Soul Execute handler.
 *
 * 直接执行 Soul Agent 并发送 completion 事件：
 * 1. 验证请求参数
 * 2. 创建 task 记录（status: PENDING）
 * 3. 设置 streams 并执行 Soul Agent
 * 4. 发送 agent.task.completed 事件
 */
export const handler = async (request: any, { emit, logger, streams }: any) => {
  // Get soulId from path parameters (support both pathParams and params)
  const soulId = request.pathParams?.soulId || request.params?.soulId;
  const { userId, trigger_time, context: triggerContext } = request.body;

  if (!userId || !triggerContext) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing required fields: userId, context'
      }
    };
  }

  // Extract threadId from trigger context to match with initialize session
  const threadId = triggerContext.data?.threadId;

  // Include threadId in sessionId to ensure unique taskId per thread
  const sessionId = threadId
    ? `soul-${soulId}-${userId}-${threadId}`
    : `soul-${soulId}-${userId}`;
  const taskId = `task-${sessionId}`;

  // Extract messageId from trigger context (used by myecho to match responses)
  const messageId = triggerContext.data?.messageId;

  // Extract user message from trigger context
  const userRequest = triggerContext.data?.userRequest || triggerContext.data?.message || '';
  const taskDescription = userRequest ? userRequest : 'Unknown';

  logger.info('Soul Execute API: Received trigger request', {
    soulId,
    userId,
    sessionId,
    triggerSource: triggerContext.source,
    messageId,
    userRequest
  });

  try {
    const dataStore = getDataStore();
    await dataStore.initialize();

    // ✅ 检查 task 是否已存在（多轮对话场景）
    const existingTask = await dataStore.getTask(taskId).catch(() => null);
    if (existingTask) {
      logger.info('Soul Execute API: Task already exists, reusing for multi-turn conversation', {
        taskId,
        existingStatus: existingTask.status
      });
    } else {
      // ✅ 创建 task 记录，状态为 PENDING
      await dataStore.createTask({
        id: taskId,
        task: taskDescription,  // ✅ 使用真实的任务描述
        app: request.body.app || request.body.appId || 'myagent',  // ✅ 从请求中获取 app 参数
        sessionId: sessionId,
        status: TaskStatus.PENDING,
        metadata: {
          type: 'soul_agent',
          soulId: soulId,
          userId: userId,
          characterId: soulId,
          deviceId: 'unknown',
          triggerSource: triggerContext.source
        }
      });

      logger.info('Soul Execute API: Task created', { taskId, status: 'PENDING', task: taskDescription, app: request.body.app || 'myagent' });
    }

    // ✅ 设置全局 streams，确保执行追踪、Token使用等功能正常工作
    setAgentStreams(streams);

    // ✅ 激活并执行 Soul Agent
    const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

    const result = await soulAgent.execute({
      trigger_time: trigger_time || new Date().toISOString(),
      context: triggerContext,
      streams: streams,
    });

    logger.info('Soul Execute API: Execution completed', {
      sessionId,
      result: {
        success: result.success,
        executionTime: result.executionTime
      }
    });

    // ✅ 解析 Soul Agent 的 JSON output，提取 message 字段作为纯文本 output
    let parsedOutput;
    let textOutput = result.output;  // 默认使用原始 output
    try {
      parsedOutput = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      // 提取 message 字段作为纯文本输出
      if (parsedOutput.message) {
        textOutput = parsedOutput.message;
      }
    } catch (e) {
      // 如果不是 JSON，保持原样
      parsedOutput = null;
    }

    // ✅ 发送 agent.task.completed 事件，触发所有 subscribers
    // 重要：将 output 从 JSON 字符串改为纯文本，这样 MyEcho 可以直接使用
    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        messageId,  // ✅ 添加 messageId，让 myecho 可以匹配响应
        task: taskDescription,  // ✅ 添加 task 字段，让前端可以显示任务描述
        result: {
          success: result.success,
          // ✅ 使用纯文本作为 output（MyEcho 会保存这个到 messages.content）
          output: textOutput,
          executionTime: result.executionTime,
          metadata: result.metadata || {},
          // ✅ 保留完整的解析后数据作为 structuredOutput
          structuredOutput: parsedOutput,
        }
      }
    } as any);

    logger.info('Soul Execute API: Emitted agent.task.completed', {
      taskId,
      soulId,
      messageId,
      outputType: typeof textOutput
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Soul agent executed successfully',
        taskId,
        sessionId,
        soulId,
        output: textOutput  // ✅ 返回纯文本
      }
    };
  } catch (error: any) {
    logger.error('Soul Execute API: Execution failed', {
      error: error.message,
      stack: error.stack
    });

    // ✅ 失败时也发送事件
    await emit({
      topic: 'agent.task.failed',
      data: {
        taskId,
        sessionId,
        messageId,  // ✅ 添加 messageId
        error: error.message
      }
    } as any);

    return {
      status: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};
