/**
 * Soul Agent Executor - Event Step
 *
 * 订阅 agent.task.execute 事件（仅处理 Soul Agent 任务）
 * 执行 Soul Agent 并发送 agent.task.completed 事件
 *
 * 遵循 master-agent.step.ts 的相同模式：
 * 1. 订阅 agent.task.execute 事件
 * 2. 检查 agentType === 'soul'，跳过非 Soul 任务
 * 3. 执行 Soul Agent 逻辑
 * 4. 发送 agent.task.completed 事件
 * 5. task-result-handler 等订阅者保存所有数据
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { EventConfig } from 'motia';
import { setAgentStreams } from '../../src/core/agent/hooks/progress-notify';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Soul Agent Executor configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'soul-agent-executor',
  description: 'Executes Soul Agent tasks triggered by soul.agent.execute events',

  // ✅ 订阅 Soul 专用事件
  subscribes: ['soul.agent.execute'],

  // ✅ 发送 completion 事件（与 master-agent 一样）
  emits: ['agent.task.completed', 'agent.task.failed'],

  flows: ['agent-workflow'],
};

/**
 * Soul Agent Executor handler.
 */
export const handler = async (
  input: any,
  { emit, logger, streams }: any
) => {
  const { taskId, task, sessionId, soulId, userId, trigger_time, context } = input;

  logger.info('Soul Agent Executor: Received soul task execution request', {
    taskId,
    soulId,
    userId,
    sessionId,
    triggerSource: context?.source
  });

  try {
    // ✅ 设置全局 streams，确保执行追踪、Token使用等功能正常工作
    setAgentStreams(streams);

    // 激活 Soul Agent（获取或创建实例）
    const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

    // 执行 Soul Agent
    // 内部会调用 Agent.run()，自动推送 stream
    const soulInput = {
      trigger_time: trigger_time || new Date().toISOString(),
      context: context,
      streams: streams,
    };

    const result = await soulAgent.execute(soulInput);

    logger.info('Soul Agent Executor: Execution completed', {
      sessionId,
      result: {
        success: result.success,
        executionTime: result.executionTime
      }
    });

    // ✅ 发送 agent.task.completed 事件，触发所有 subscribers
    // 与 master-agent 的模式完全一致
    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        result: {
          success: result.success,
          output: result.output,
          executionTime: result.executionTime,
          metadata: result.metadata || {}
        }
      }
    } as any);

    logger.info('Soul Agent Executor: Emitted agent.task.completed', {
      taskId,
      soulId
    });

  } catch (error: any) {
    logger.error('Soul Agent Executor: Execution failed', {
      error: error.message,
      stack: error.stack,
      taskId,
      soulId
    });

    // ✅ 失败时也发送事件
    await emit({
      topic: 'agent.task.failed',
      data: {
        taskId,
        sessionId,
        error: error.message
      }
    } as any);
  }
};
