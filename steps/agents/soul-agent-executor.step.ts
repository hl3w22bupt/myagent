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

import { SoulAgent } from '../../src/core/agent/soul-agent';
import { soulConfigLoader } from '../../src/core/config/soul-config-loader';
import { subagentConfigLoader } from '../../src/core/config/subagent-config-loader';
import { EventConfig } from 'motia';
import { setAgentStreams } from '../../src/core/agent/hooks/progress-notify';
import { getDataStore } from '../../src/core/database/data-store';
import { soulStateDataService } from '../../src/core/database/soul-data-service';

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

    // 🔄 数据库驱动：创建临时 SoulAgent 实例（不依赖内存单例）
    // 直接加载配置，不使用 soulScheduler.activateSoul()
    const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);
    const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

    // 创建临时 SoulAgent 实例用于本次执行
    // taskId 可选：如果有 taskId 则传入（API 初始化场景），否则为 undefined（周期性检查场景）
    const soulAgent = new SoulAgent(
      soulConfig,
      subagentConfig,
      sessionId,
      userId,
      taskId  // 可选，API 初始化时会有 taskId
    );

    // 🔄 从数据库加载 Soul Agent 状态（确保 lastActivity 等字段正确）
    try {
      const existingState = await soulStateDataService.getSoulState(sessionId);
      if (existingState && existingState.lastActivity) {
        // 更新临时实例的 lastActivity，确保决策时使用正确的时间
        soulAgent.setLastActivity(existingState.lastActivity);
        logger.info('Soul Agent Executor: Loaded state from database', {
          sessionId,
          lastActivity: new Date(existingState.lastActivity).toISOString(),
        });
      }
    } catch (error) {
      logger.warn('Soul Agent Executor: Failed to load state from database, using defaults', {
        sessionId,
        error: (error as Error).message,
      });
    }

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

    // ✅ 解析 Soul Agent 的 JSON output，提取 message 字段作为纯文本 output
    // 与 soul-api.step.ts 的处理逻辑一致
    let parsedOutput;
    let textOutput = result.output;  // 默认使用原始 output

    // ✅ Soul Agent 特殊处理：如果是 hibernate 且没有 output，使用 reason 作为 output
    if (!textOutput && result.action === 'hibernated' && result.reason) {
      textOutput = result.reason;
    }

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

    // ✅ Soul Agent 特殊处理：如果是 hibernate，不发送 agent.task.completed 事件
    // Hibernate 不应该生成任务结果，不应该显示在任务详情页
    if (result.action === 'hibernated') {
      logger.info('Soul Agent Executor: Soul Agent hibernated, skipping agent.task.completed event', {
        sessionId,
        soulId,
        taskId,
        reason: result.reason
      });

      // ✅ 仍然保存执行历史（但不作为任务完成）
      // 执行历史可以记录"决策：不打扰"，但不应显示为任务执行结果
      return {
        success: true,
        hibernated: true,
        reason: result.reason
      };
    }

    // ✅ 发送 agent.task.completed 事件，触发所有 subscribers
    // 与 master-agent 的模式完全一致
    await emit({
      topic: 'agent.task.completed',
      data: {
        taskId,
        sessionId,
        task: input.task,  // ✅ 添加 task 字段
        result: {
          success: result.success,
          output: textOutput,  // ✅ 使用纯文本（与其他 agent 一致）
          executionTime: result.executionTime,
          metadata: result.metadata || {},
          structuredOutput: parsedOutput,  // ✅ 保留完整的解析后数据
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
