/**
 * SoulAgent - Autonomous Agent with Hibernation/Wakeup
 *
 * = Subagent（角色） + Soul（目标） + 自主运行
 *
 * SoulAgent is a generic framework implementation with zero business logic.
 * All business logic is defined in soul.yaml's goal field.
 */

import { Agent } from './agent';
import { AgentConfig } from './types';
import { SoulConfig, SoulState, SoulInput, PrimitiveTool } from './soul-types';
import { soulStateDataService } from '../database/soul-data-service';
import { soulExecutionHistoryService } from '../database/soul-data-service';
import { soulNotificationDataService } from '../database/soul-notification-service';
import { SoulExecutionRecord } from './soul-execution-types';
import { extractUserId } from '../utils/session-utils';
import { createExecutionId, calculateDuration } from '../utils/date-utils';
import { MAX_DECISION_LENGTH, DEFAULT_TASK_NAME } from '../constants/execution';
import { getDataStore } from '../database/data-store';
import { SoulContextBuilder } from '../context/soul-context-builder';
import { SoulExecutionContext, DecisionResult } from './soul-context-types';

/**
 * SoulAgent - Autonomous agent with hibernation capabilities
 */
export class SoulAgent extends Agent {
  private soulConfig: SoulConfig;
  private subagentConfig: any;
  private soulState: SoulState;
  private userId: string;
  private taskId: string;  // ← 关联的主 task
  private lastTriggerSource: string;  // 记录最后一次触发源
  private lastTriggerTime: string;  // 记录最后一次触发时间

  /**
   * Create a new SoulAgent instance
   *
   * @param soulConfig - Soul configuration from soul.yaml
   * @param subagentConfig - Subagent configuration
   * @param sessionId - Session identifier
   * @param userId - User identifier
   * @param taskId - Associated task ID
   */
  constructor(
    soulConfig: SoulConfig,
    subagentConfig: any,
    sessionId: string,
    userId?: string,
    taskId?: string
  ) {
    // 1. Combine System Prompt (role + goal)
    const combinedPrompt = SoulAgent.combinePrompts(
      subagentConfig.system_prompt || subagentConfig.agent?.system_prompt || '',
      soulConfig.goal
    );

    // 2. Create Agent configuration
    const agentConfig: AgentConfig = {
      name: soulConfig.display_name,
      systemPrompt: combinedPrompt,
      availableSkills: subagentConfig.available_skills || subagentConfig.agent?.available_skills,
      llm: subagentConfig.llm || subagentConfig.agent?.llm,
      sandbox: subagentConfig.sandbox || subagentConfig.agent?.sandbox,
      constraints: subagentConfig.constraints || subagentConfig.agent?.constraints
    };

    // 3. Initialize base Agent
    super(agentConfig, sessionId);

    // 4. Save configurations
    this.soulConfig = soulConfig;
    this.subagentConfig = subagentConfig;

    // 5. Extract and save userId
    this.userId = userId || extractUserId(sessionId, this.soulConfig.soul_id);

    // 6. Save taskId (主 task，所有对话都在这个 task 上)
    this.taskId = taskId || `task-${sessionId}`;

    // 7. Initialize Soul state
    this.soulState = {
      status: 'IDLE',
      currentTask: this.taskId,  // ← 保留 taskId，用于 periodic check 触发
      lastActivity: null,
      scheduledWakeup: null,
      activeSince: null,
      statistics: {
        totalTasks: 0,
        uptime: 0
      }
    };

    // 8. Initialize trigger tracking
    this.lastTriggerSource = '';
    this.lastTriggerTime = '';

    console.log(`[SoulAgent] Created soul agent: ${soulConfig.soul_id} (${soulConfig.display_name}) with task: ${this.taskId}`);
  }

  /**
   * Get subject info for trace display
   * Returns "Auto-Agent/${soul_id}" format for proper identification
   */
  getSubjectInfo(): { subjectTitle: string; subjectSubTitle?: string } {
    return {
      subjectTitle: `Auto-Agent/${this.soulConfig.soul_id}`,
      subjectSubTitle: this.soulConfig.display_name
    };
  }

  /**
   * Combine prompts (subagent role + soul goal)
   *
   * Strategy: Keep subagent's role definition, add soul's goal
   *
   * @param subagentPrompt - Subagent's system prompt (role definition)
   * @param soulGoal - Soul's long-term goal
   * @returns Combined system prompt
   */
  static combinePrompts(subagentPrompt: string, soulGoal: string): string {
    return `
${subagentPrompt}

---

# 你的长期目标（Soul Goal）

${soulGoal}

---
    `.trim();
  }

  /**
   * Execute trigger task (main entry point for Soul) - 【包工头逻辑】
   *
   * 根据触发源决定处理方式：
   * - API 触发（user_message）：接单模式 - 取消当前任务，处理用户消息
   * - 定时触发（periodic_check）：造单模式 - 判断是否需要行动
   *
   * @param input - Soul execution input
   * @returns Execution result
   */
  async execute(input: SoulInput & { streams?: any }): Promise<any> {
    const { trigger_time, context, streams } = input;
    const source = context.source;

    // 记录触发源和时间
    this.lastTriggerSource = source;
    this.lastTriggerTime = trigger_time;

    console.log(`[SoulAgent] ${this.sessionId} executing at ${trigger_time}, source: ${source}`);

    // 【包工头逻辑】根据触发源选择处理方式
    if (source === 'user_message') {
      // 【接单模式】API 触发：用户消息优先
      return await this.handleUserMessage(input, streams);
    } else {
      // 【造单模式】定时触发：自主决策
      return await this.handlePeriodicCheck(input, streams);
    }
  }

  /**
   * 【接单模式】处理用户消息
   *
   * 客户优先：取消正在运行的任务，立即处理用户消息
   *
   * @param input - Soul execution input
   * @param streams - Stream 更新接口
   * @returns Execution result
   */
  private async handleUserMessage(input: SoulInput, streams: any): Promise<any> {
    const { trigger_time, context } = input;
    const dataStore = getDataStore();

    // Create execution record
    const triggeredAt = new Date(trigger_time);
    const startedAt = new Date();

    const executionRecord: SoulExecutionRecord = {
      id: createExecutionId(this.sessionId),
      soulId: this.soulConfig.soul_id,
      sessionId: this.sessionId,
      userId: this.userId,
      triggeredAt,
      triggerSource: context.source,
      triggerData: context.data,
      startedAt,
      status: 'running',
      currentTask: DEFAULT_TASK_NAME,
      primitiveCalls: []
    };

    // Save initial execution record
    await soulExecutionHistoryService.saveExecution(executionRecord);

    try {
      console.log(`[SoulAgent] 【接单模式】处理用户消息`);

      // 如果正在运行，取消当前任务（用户消息优先）
      if (this.soulState.currentTask) {
        console.log(`[SoulAgent] Cancelling current task - user message priority`);
        await this.cancelCurrentTask();
      }

      // 1. 更新主任务状态为 'running'
      try {
        await dataStore.initialize();
        const task = await dataStore.getTask(this.taskId);
        if (task) {
          const taskDescription = `用户发来消息：${context.data.userRequest || context.data.message || '(无内容)'}`;
          await dataStore.updateTask(this.taskId, {
            status: 'running',
            task: taskDescription.substring(0, 200)
          });
          console.log(`[SoulAgent] Updated main task status to running: ${this.taskId}`);
        }
      } catch (error) {
        console.error(`[SoulAgent] Failed to update main task status:`, error);
      }

      // 2. Update state
      this.soulState.status = 'ACTIVE';
      this.soulState.lastActivity = Date.now();
      if (!this.soulState.activeSince) {
        this.soulState.activeSince = Date.now();
      }
      // ✅ 保留主任务 ID（this.taskId），不覆盖为 execution ID
      // this.soulState.currentTask = executionRecord.id;  // ❌ 不要覆盖主任务 ID

      // 3. Build task prompt
      const taskPrompt = `用户发来消息：${context.data.userRequest || context.data.message || '(无内容)'}`;
      executionRecord.currentTask = `Execute soul: user_message`;

      // 4. 保存用户消息到对话历史
      if (context.data?.userRequest) {
        try {
          await dataStore.initialize();
          const existingContext = await dataStore.getContext(this.taskId);
          if (!existingContext) {
            await dataStore.createTaskContext(this.taskId, this.sessionId, context.data.userRequest);
          }
          await dataStore.addConversationRound(this.taskId, {
            round: Date.now(),
            timestamp: Date.now(),
            userMessage: context.data.userRequest,
            assistantOutput: null,
            summary: '',
          });
          console.log(`[SoulAgent] ✅ Saved user message to task_contexts`);
        } catch (error) {
          console.error(`[SoulAgent] Failed to save user message:`, error);
        }
      }

      // 5. 推送 stream 更新
      if (streams?.taskExecution) {
        const startUniqueId = `${this.taskId}-start-${Date.now()}`;
        await streams.taskExecution.set(this.taskId, startUniqueId, {
          taskId: this.taskId,
          task: taskPrompt.substring(0, 100),
          status: 'running',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'soul_execution',
          stage: 'executing',
          progressType: 'soul_trigger',
          metadata: {
            data: {
              triggerSource: context.source,
              triggerData: context.data,
              message: `Soul Agent triggered by: user_message`
            }
          }
        });
      }

      // 6. 发送 Task 层级的 execution trace
      if (streams?.executionTraces) {
        const taskTraceId = `task-start-${this.taskId}-${Date.now()}`;
        await streams.executionTraces.set(this.taskId, taskTraceId, {
          id: taskTraceId,
          level: 'task',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'pre',
          status: 'running',
          inputData: JSON.stringify({
            triggerSource: context.source,
            triggerData: context.data,
            task: taskPrompt
          }),
          outputData: JSON.stringify({
            message: 'Soul Agent task started'
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            soulId: this.soulConfig.soul_id,
            data: {
              triggerSource: context.source,
              taskType: 'soul_execution'
            }
          }
        });
      }

      // 7. 发送 Agent 层级的 pre execution trace
      if (streams?.executionTraces) {
        const agentPreTraceId = `agent-${this.sessionId}-pre-${Date.now()}`;
        const subjectInfo = this.getSubjectInfo();
        await streams.executionTraces.set(this.taskId, agentPreTraceId, {
          id: agentPreTraceId,
          level: 'agent',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'pre',
          status: 'started',
          inputData: JSON.stringify({
            task: taskPrompt,
            agentType: 'SoulAgent',
            soulId: this.soulConfig.soul_id,
            triggerSource: context.source
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            subjectTitle: subjectInfo.subjectTitle,
            subjectSubTitle: subjectInfo.subjectSubTitle,
            soulId: this.soulConfig.soul_id
          }
        });
      }

      // 8. 加载对话历史
      let conversationHistory: any[] = [];
      try {
        const taskContext = await dataStore.getContext(this.taskId);
        if (taskContext && taskContext.conversationRounds) {
          conversationHistory = [];
          for (const round of taskContext.conversationRounds) {
            if (round.userMessage) {
              conversationHistory.push({
                role: 'user',
                content: round.userMessage,
                timestamp: round.timestamp,
              });
            }
            if (round.assistantOutput) {
              conversationHistory.push({
                role: 'assistant',
                content: round.assistantOutput,
                timestamp: round.timestamp,
              });
            }
          }
          console.log(`[SoulAgent] ✅ Loaded ${conversationHistory.length} messages from conversation history`);
        }
      } catch (error) {
        console.error(`[SoulAgent] Failed to load conversation history:`, error);
      }

      // 9. 调用基类 Agent.run()
      const result = await this.run(
        taskPrompt,
        this.taskId,
        {
          conversationHistory: conversationHistory,
          tools: this.getPrimitiveTools(),
          streams: streams
        }
      );

      console.log(`[SoulAgent] 🔍 Result from Agent.run():`, {
        success: result.success,
        hasOutput: !!result.output,
        outputLength: result.output?.length || 0,
        outputPreview: result.output?.substring(0, 100) || '(no output)',
        hasError: !!result.error,
        executionTime: result.executionTime,
        stepsCount: result.steps?.length || 0,
      });

      // 10. 记录执行结果
      if (result.output) {
        executionRecord.llmThoughtProcess = 'Soul responded to user message';
        executionRecord.llmDecision = result.output.substring(0, MAX_DECISION_LENGTH);
      }

      // 11. 保存助手响应到对话历史
      if (result.output) {
        try {
          let assistantMessage = result.output;
          try {
            const parsed = JSON.parse(result.output);
            if (parsed.message) {
              assistantMessage = parsed.message;
            }
          } catch {
            // 不是 JSON，使用原始 output
          }

          await dataStore.initialize();
          const currentContext = await dataStore.getContext(this.taskId);
          if (currentContext && currentContext.conversationRounds && currentContext.conversationRounds.length > 0) {
            const rounds = currentContext.conversationRounds;
            const lastRound = rounds[rounds.length - 1];
            lastRound.assistantOutput = assistantMessage;

            const pool = (dataStore as any).pool;
            const client = await pool.connect();
            try {
              await client.query(
                `UPDATE task_contexts
                 SET conversation_rounds = $1, updated_at = $2
                 WHERE task_id = $3`,
                [JSON.stringify(rounds), Date.now(), this.taskId]
              );
              console.log(`[SoulAgent] ✅ Saved assistant response to task_contexts`);
            } finally {
              client.release();
            }
          }
        } catch (error) {
          console.error(`[SoulAgent] Failed to save assistant response:`, error);
        }
      }

      // 12. 发送 Agent 层级的 post execution trace
      if (streams?.executionTraces) {
        const agentPostTraceId = `agent-${this.sessionId}-post-${Date.now()}`;
        const subjectInfo = this.getSubjectInfo();
        const status = result.success !== false ? 'completed' : 'failed';
        await streams.executionTraces.set(this.taskId, agentPostTraceId, {
          id: agentPostTraceId,
          level: 'agent',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'post',
          status: status,
          outputData: result.output ? JSON.stringify({ output: result.output }) : undefined,
          error: result.error,
          executionTime: result.executionTime,
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            subjectTitle: subjectInfo.subjectTitle,
            subjectSubTitle: subjectInfo.subjectSubTitle,
            soulId: this.soulConfig.soul_id,
            success: result.success !== false,
            steps: result.steps?.length || 0
          }
        });
      }

      // 13. 更新执行记录
      executionRecord.status = 'completed';
      executionRecord.completedAt = new Date();
      executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
      executionRecord.output = {
        output: result.output,
        steps: result.steps?.length || 0
      };
      await soulExecutionHistoryService.saveExecution(executionRecord);

      // 14. 推送执行完成的 stream 更新
      if (streams?.taskExecution) {
        const completeUniqueId = `${this.taskId}-complete-${Date.now()}`;
        await streams.taskExecution.set(this.taskId, completeUniqueId, {
          taskId: this.taskId,
          task: result.output || '执行完成',
          status: 'completed',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'soul_execution',
          stage: 'completed',
          progressType: 'soul_completion',
          metadata: {
            data: {
              output: result.output,
              steps: result.steps?.length || 0,
              duration: executionRecord.duration,
              message: 'Soul Agent execution completed'
            }
          }
        });
      }

      // 15. 发送 Task 完成的 execution trace
      if (streams?.executionTraces) {
        const taskTraceId = `task-complete-${this.taskId}-${Date.now()}`;
        await streams.executionTraces.set(this.taskId, taskTraceId, {
          id: taskTraceId,
          level: 'task',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'post',
          status: 'completed',
          inputData: JSON.stringify({
            triggerSource: context.source,
            task: taskPrompt
          }),
          outputData: JSON.stringify({
            output: result.output,
            steps: result.steps?.length || 0,
            duration: executionRecord.duration,
            success: result.success
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            soulId: this.soulConfig.soul_id,
            data: {
              triggerSource: context.source,
              taskType: 'soul_execution',
              executionStatus: 'completed'
            }
          }
        });
      }

      // 16. 执行完成后休眠
      await this.hibernate('执行完成，等待下次触发');

      return result;
    } catch (error: any) {
      // 更新执行记录为失败
      executionRecord.status = 'failed';
      executionRecord.completedAt = new Date();
      executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
      executionRecord.error = error.message;
      await soulExecutionHistoryService.saveExecution(executionRecord);

      // 失败后也要休眠，避免持续重试
      await this.hibernate(`执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 【造单模式】处理定时检查
   *
   * 判断是否需要行动：
   * - 不需要 → 休眠
   * - 需要 → 描述任务 → 调用基类 Agent.run()
   *
   * @param input - Soul execution input
   * @param streams - Stream 更新接口
   * @returns Execution result
   */
  private async handlePeriodicCheck(input: SoulInput, streams: any): Promise<any> {
    const { trigger_time, context } = input;
    const dataStore = getDataStore();

    // Create execution record
    const triggeredAt = new Date(trigger_time);
    const startedAt = new Date();

    const executionRecord: SoulExecutionRecord = {
      id: createExecutionId(this.sessionId),
      soulId: this.soulConfig.soul_id,
      sessionId: this.sessionId,
      userId: this.userId,
      triggeredAt,
      triggerSource: context.source,
      triggerData: context.data,
      startedAt,
      status: 'running',
      currentTask: DEFAULT_TASK_NAME,
      primitiveCalls: []
    };

    // Save initial execution record
    await soulExecutionHistoryService.saveExecution(executionRecord);

    try {
      console.log(`[SoulAgent] 【造单模式】处理定时检查`);

      // 1. 构建结构化上下文
      const ctx = SoulContextBuilder.build(trigger_time, context);

      // 2. 判断是否需要行动（前置决策）
      const decision = await this.makeDecision(ctx);

      if (!decision.needsAction) {
        // 不需要行动，直接休眠
        console.log(`[SoulAgent] ${this.sessionId} no action needed: ${decision.reason}`);

        executionRecord.status = 'completed';
        executionRecord.completedAt = new Date();
        executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
        executionRecord.llmDecision = decision.reason;
        await soulExecutionHistoryService.saveExecution(executionRecord);

        await this.hibernate(decision.reason || '无需行动');
        return { success: true, action: 'hibernated', reason: decision.reason };
      }

      // 3. 需要行动，描述任务
      console.log(`[SoulAgent] ${this.sessionId} action needed: ${decision.reason}`);
      const taskPrompt = this.buildTaskDescription(ctx);
      executionRecord.currentTask = `Execute soul: ${decision.reason}`;

      // 4. Update state
      this.soulState.status = 'ACTIVE';
      this.soulState.lastActivity = Date.now();
      if (!this.soulState.activeSince) {
        this.soulState.activeSince = Date.now();
      }
      // ✅ 保留主任务 ID（this.taskId），不覆盖为 execution ID
      // execution ID 用于执行历史追踪，但 currentTask 应该始终指向主任务
      // this.soulState.currentTask = executionRecord.id;  // ❌ 不要覆盖主任务 ID

      // 5. 更新主任务状态为 'running'
      try {
        await dataStore.initialize();
        const task = await dataStore.getTask(this.taskId);
        if (task) {
          await dataStore.updateTask(this.taskId, {
            status: 'running',
            task: taskPrompt.substring(0, 200)
          });
          console.log(`[SoulAgent] Updated main task status to running: ${this.taskId}`);
        }
      } catch (error) {
        console.error(`[SoulAgent] Failed to update main task status:`, error);
      }

      // 6. 推送 stream 更新
      if (streams?.taskExecution) {
        const startUniqueId = `${this.taskId}-start-${Date.now()}`;
        await streams.taskExecution.set(this.taskId, startUniqueId, {
          taskId: this.taskId,
          task: taskPrompt.substring(0, 100),
          status: 'running',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'soul_execution',
          stage: 'executing',
          progressType: 'soul_trigger',
          metadata: {
            data: {
              triggerSource: context.source,
              triggerData: context.data,
              message: `Soul Agent triggered by: ${context.source}`
            }
          }
        });
      }

      // 7. 发送 Task 层级的 execution trace
      if (streams?.executionTraces) {
        const taskTraceId = `task-start-${this.taskId}-${Date.now()}`;
        await streams.executionTraces.set(this.taskId, taskTraceId, {
          id: taskTraceId,
          level: 'task',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'pre',
          status: 'running',
          inputData: JSON.stringify({
            triggerSource: context.source,
            triggerData: context.data,
            task: taskPrompt
          }),
          outputData: JSON.stringify({
            message: 'Soul Agent task started'
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            soulId: this.soulConfig.soul_id,
            data: {
              triggerSource: context.source,
              taskType: 'soul_execution'
            }
          }
        });
      }

      // 8. 发送 Agent 层级的 pre execution trace
      if (streams?.executionTraces) {
        const agentPreTraceId = `agent-${this.sessionId}-pre-${Date.now()}`;
        const subjectInfo = this.getSubjectInfo();
        await streams.executionTraces.set(this.taskId, agentPreTraceId, {
          id: agentPreTraceId,
          level: 'agent',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'pre',
          status: 'started',
          inputData: JSON.stringify({
            task: taskPrompt,
            agentType: 'SoulAgent',
            soulId: this.soulConfig.soul_id,
            triggerSource: context.source
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            subjectTitle: subjectInfo.subjectTitle,
            subjectSubTitle: subjectInfo.subjectSubTitle,
            soulId: this.soulConfig.soul_id
          }
        });
      }

      // 9. 加载对话历史
      let conversationHistory: any[] = [];
      try {
        const taskContext = await dataStore.getContext(this.taskId);
        if (taskContext && taskContext.conversationRounds) {
          conversationHistory = [];
          for (const round of taskContext.conversationRounds) {
            if (round.userMessage) {
              conversationHistory.push({
                role: 'user',
                content: round.userMessage,
                timestamp: round.timestamp,
              });
            }
            if (round.assistantOutput) {
              conversationHistory.push({
                role: 'assistant',
                content: round.assistantOutput,
                timestamp: round.timestamp,
              });
            }
          }
          console.log(`[SoulAgent] ✅ Loaded ${conversationHistory.length} messages from conversation history`);
        }
      } catch (error) {
        console.error(`[SoulAgent] Failed to load conversation history:`, error);
      }

      // 10. 调用基类 Agent.run()
      const result = await this.run(
        taskPrompt,
        this.taskId,
        {
          conversationHistory: conversationHistory,
          tools: this.getPrimitiveTools(),
          streams: streams
        }
      );

      console.log(`[SoulAgent] 🔍 Result from Agent.run():`, {
        success: result.success,
        hasOutput: !!result.output,
        outputLength: result.output?.length || 0,
        outputPreview: result.output?.substring(0, 100) || '(no output)',
        hasError: !!result.error,
        executionTime: result.executionTime,
        stepsCount: result.steps?.length || 0,
      });

      // 11. 记录执行结果
      if (result.output) {
        executionRecord.llmThoughtProcess = 'Soul decided on action based on goal and context';
        executionRecord.llmDecision = result.output.substring(0, MAX_DECISION_LENGTH);
      }

      // 12. 发送 Agent 层级的 post execution trace
      if (streams?.executionTraces) {
        const agentPostTraceId = `agent-${this.sessionId}-post-${Date.now()}`;
        const subjectInfo = this.getSubjectInfo();
        const status = result.success !== false ? 'completed' : 'failed';
        await streams.executionTraces.set(this.taskId, agentPostTraceId, {
          id: agentPostTraceId,
          level: 'agent',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'post',
          status: status,
          outputData: result.output ? JSON.stringify({ output: result.output }) : undefined,
          error: result.error,
          executionTime: result.executionTime,
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            subjectTitle: subjectInfo.subjectTitle,
            subjectSubTitle: subjectInfo.subjectSubTitle,
            soulId: this.soulConfig.soul_id,
            success: result.success !== false,
            steps: result.steps?.length || 0
          }
        });
      }

      // 13. 更新执行记录
      executionRecord.status = 'completed';
      executionRecord.completedAt = new Date();
      executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
      executionRecord.output = {
        output: result.output,
        steps: result.steps?.length || 0
      };
      await soulExecutionHistoryService.saveExecution(executionRecord);

      // 14. 推送执行完成的 stream 更新
      if (streams?.taskExecution) {
        const completeUniqueId = `${this.taskId}-complete-${Date.now()}`;
        await streams.taskExecution.set(this.taskId, completeUniqueId, {
          taskId: this.taskId,
          task: result.output || '执行完成',
          status: 'completed',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          type: 'soul_execution',
          stage: 'completed',
          progressType: 'soul_completion',
          metadata: {
            data: {
              output: result.output,
              steps: result.steps?.length || 0,
              duration: executionRecord.duration,
              message: 'Soul Agent execution completed'
            }
          }
        });
      }

      // 15. 发送 Task 完成的 execution trace
      if (streams?.executionTraces) {
        const taskTraceId = `task-complete-${this.taskId}-${Date.now()}`;
        await streams.executionTraces.set(this.taskId, taskTraceId, {
          id: taskTraceId,
          level: 'task',
          taskId: this.taskId,
          agentId: this.sessionId,
          stage: 'post',
          status: 'completed',
          inputData: JSON.stringify({
            triggerSource: context.source,
            task: taskPrompt
          }),
          outputData: JSON.stringify({
            output: result.output,
            steps: result.steps?.length || 0,
            duration: executionRecord.duration,
            success: result.success
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: this.sessionId,
            soulId: this.soulConfig.soul_id,
            data: {
              triggerSource: context.source,
              taskType: 'soul_execution',
              executionStatus: 'completed'
            }
          }
        });
      }

      // 16. 执行完成后休眠
      await this.hibernate('执行完成，等待下次触发');

      return result;
    } catch (error: any) {
      // 更新执行记录为失败
      executionRecord.status = 'failed';
      executionRecord.completedAt = new Date();
      executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
      executionRecord.error = error.message;
      await soulExecutionHistoryService.saveExecution(executionRecord);

      // 失败后也要休眠，避免持续重试
      await this.hibernate(`执行失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 【心跳方法】由 HeartbeatScheduler 调用
   *
   * 简化版的造单模式，只做决策，不执行完整流程
   * 用于定期检查是否需要主动行动
   *
   * @returns 心跳结果
   */
  async heartbeat(): Promise<{ action: 'hibernate' | 'active' | 'complete'; reason?: string }> {
    console.log(`[SoulAgent] 💓 Heartbeat: ${this.sessionId}`);

    try {
      // 1. 构建结构化上下文
      const now = new Date();
      const trigger_time = now.toISOString();
      const context = {
        source: 'heartbeat',
        data: {
          reason: 'Periodic heartbeat check',
          last_interaction: this.soulState.lastActivity
            ? new Date(this.soulState.lastActivity).toISOString()
            : null,
          current_hour: now.getHours()
        }
      };

      const ctx = SoulContextBuilder.build(trigger_time, context);

      // 2. 判断是否需要行动
      const decision = await this.makeDecision(ctx);

      if (!decision.needsAction) {
        // 不需要行动，返回休眠状态
        console.log(`[SoulAgent] ${this.sessionId} no action needed: ${decision.reason}`);

        // 更新状态为 IDLE
        this.soulState.status = 'IDLE';

        return {
          action: 'hibernate',
          reason: decision.reason
        };
      }

      // 3. 需要行动 - 调用完整的 execute 方法
      console.log(`[SoulAgent] ${this.sessionId} action needed: ${decision.reason}`);

      // 更新状态为 ACTIVE
      this.soulState.status = 'ACTIVE';
      this.soulState.lastActivity = Date.now();
      if (!this.soulState.activeSince) {
        this.soulState.activeSince = Date.now();
      }

      // 执行完整流程（会自动调用 handlePeriodicCheck）
      await this.execute({
        trigger_time,
        context
      });

      // 执行完成后，根据状态返回
      if (this.shouldHibernate()) {
        return { action: 'hibernate', reason: 'Task completed, should hibernate' };
      }

      return { action: 'active', reason: 'Task completed, still active' };

    } catch (error: any) {
      console.error(`[SoulAgent] ${this.sessionId} heartbeat error:`, error);

      // 出错时也返回休眠，避免持续重试
      return {
        action: 'hibernate',
        reason: `Heartbeat error: ${error.message}`
      };
    }
  }

  /**
   * 【前置决策】判断是否需要行动
   *
   * 基于结构化上下文，让 LLM 快速判断是否需要行动
   *
   * @param ctx - 结构化上下文
   * @returns 决策结果
   */
  private async makeDecision(ctx: SoulExecutionContext): Promise<DecisionResult> {
    console.log(`[SoulAgent] Making decision based on context`);

    const prompt = `
根据上下文快速判断是否需要行动（回答 JSON）：

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

## 你的目标

${this.soulConfig.goal}

## 判断标准

- 需要：应该主动互动（问候、关心、陪伴等）
- 不需要：用户状态良好，无需打扰

回答格式：
\`\`\`json
{
  "needsAction": true/false,
  "reason": "原因说明"
}
\`\`\`
    `.trim();

    try {
      // 使用父类 Agent 的 llm 实例进行决策
      const response = await this.llm.messagesCreate(
        [
          { role: 'system', content: '你是一个决策助手。只返回纯 JSON，不要包含其他文字或 markdown 标记。' },
          { role: 'user', content: prompt }
        ],
        {
          max_tokens: 200,
          temperature: 0
        },
        'soul decision'
      );

      // 解析 JSON 响应
      const content = response.content;

      // 尝试直接解析
      try {
        const decision = JSON.parse(content);
        return decision;
      } catch (parseError) {
        // 如果直接解析失败，尝试提取 JSON（处理可能的 markdown 代码块）
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const decision = JSON.parse(jsonMatch[0]);
          return decision;
        }
        throw parseError;
      }
    } catch (error) {
      console.error('[SoulAgent] Decision failed:', error);
      // 默认：不需要行动
      return { needsAction: false, reason: '决策失败，保守处理' };
    }
  }

  /**
   * 构建任务描述
   *
   * 把决策后的任务描述清楚，交给基类 Agent 处理
   *
   * @param ctx - 结构化上下文
   * @returns 任务描述
   */
  private buildTaskDescription(ctx: SoulExecutionContext): string {
    return `
## 📍 当前情况

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

---

## 🎯 你的目标

${this.soulConfig.goal}

---

## 💡 任务

根据当前上下文，判断是否需要主动互动。
如果需要，直接行动。
如果不需要，调用 hibernate() 休眠。
    `.trim();
  }

  /**
   * 取消当前任务
   */
  private async cancelCurrentTask(): Promise<void> {
    if (this.soulState.currentTask) {
      const dataStore = getDataStore();
      try {
        await dataStore.initialize();
        await dataStore.updateTask(this.soulState.currentTask, {
          status: 'cancelled',
          error: 'Cancelled by user message (priority)'
        });
        console.log(`[SoulAgent] ✅ Cancelled task: ${this.soulState.currentTask}`);
      } catch (error) {
        console.error(`[SoulAgent] Failed to cancel task:`, error);
      }
    }
  }

  /**
   * Get primitive tools
   *
   * These tools will be injected into LLM execution environment
   *
   * @returns Array of primitive tools
   */
  private getPrimitiveTools(): PrimitiveTool[] {
    return [
      {
        name: 'send_message',
        description: '发送消息给用户',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '要发送的消息内容' }
          },
          required: ['message']
        },
        implementation: async (args) => {
          return await this.sendMessage(args.message);
        }
      },
      {
        name: 'send_notification',
        description: '发送推送通知',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '通知标题' },
            body: { type: 'string', description: '通知内容' },
            urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: '紧急程度' }
          },
          required: ['title', 'body']
        },
        implementation: async (args) => {
          return await this.sendNotification(args);
        }
      },
      {
        name: 'hibernate',
        description: '进入休眠状态，释放资源',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: '休眠原因' }
          },
          required: ['reason']
        },
        implementation: async (args) => {
          return await this.hibernate(args.reason);
        }
      },
      {
        name: 'complete',
        description: '标记当前任务完成',
        parameters: {
          type: 'object',
          properties: {
            result: { type: 'object', description: '任务结果' }
          },
          required: ['result']
        },
        implementation: async (args) => {
          return await this.completeTask(args.result);
        }
      }
    ];
  }

  /**
   * Handle primitive calls
   *
   * Check LLM execution result for primitive calls and track them
   *
   * @param result - Agent execution result
   * @returns Array of primitive call records
   */
  private async handlePrimitives(result: any): Promise<Array<any>> {
    const primitiveCalls: Array<any> = [];

    if (!result.steps) return primitiveCalls;

    for (const step of result.steps) {
      if (!step.toolCalls) continue;

      for (const toolCall of step.toolCalls) {
        const callRecord: any = {
          name: toolCall.name,
          arguments: toolCall.arguments,
          timestamp: new Date(),
          success: true,
          result: null
        };

        try {
          switch (toolCall.name) {
            case 'hibernate':
              console.log(`[SoulAgent] ${this.sessionId} hibernating: ${toolCall.arguments?.reason}`);
              callRecord.result = { hibernated: true };
              break;

            case 'complete':
              console.log(`[SoulAgent] ${this.sessionId} completed task`);
              callRecord.result = { completed: true };
              break;

            case 'send_message':
              console.log(`[SoulAgent] ${this.sessionId} sending message`);
              callRecord.result = await this.sendMessage(toolCall.arguments?.message);
              break;

            case 'send_notification':
              console.log(`[SoulAgent] ${this.sessionId} sending notification`);
              callRecord.result = await this.sendNotification(toolCall.arguments);
              break;

            default:
              console.log(`[SoulAgent] ${this.sessionId} unknown primitive: ${toolCall.name}`);
              callRecord.success = false;
              callRecord.error = `Unknown primitive: ${toolCall.name}`;
          }
        } catch (error: any) {
          callRecord.success = false;
          callRecord.error = error.message;
          console.error(`[SoulAgent] Primitive call failed: ${toolCall.name}`, error);
        }

        primitiveCalls.push(callRecord);
      }
    }

    return primitiveCalls;
  }

  /**
   * Hibernate (进入空闲状态)
   *
   * Soul Agent 的 hibernate 不是"销毁"实例，而是"暂停"
   * - 改变状态为 IDLE
   * - 保存状态到数据库
   * - 更新 scheduled_wakeup 时间（用于 periodic check cron 触发）
   *
   * @param reason - Hibernate reason
   */
  private async hibernate(reason: string): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} hibernating: ${reason}`);

    // 1. Calculate and accumulate uptime before going to IDLE
    if (this.soulState.activeSince) {
      const sessionUptime = Date.now() - this.soulState.activeSince;
      this.soulState.statistics.uptime += sessionUptime;
      this.soulState.activeSince = null;
      console.log(`[SoulAgent] ${this.sessionId} accumulated uptime: ${Math.round(sessionUptime / 1000)}s, total: ${Math.round(this.soulState.statistics.uptime / 1000)}s`);
    }

    // 2. 更新状态为 IDLE（不是 HIBERNATED，区别在于：IDLE 等待下次触发，HIBERNATED 是长期休眠）
    this.soulState.status = 'IDLE';
    // 注意：不清空 currentTask，保留它以便 periodic check 触发时使用

    // 3. 保存状态到数据库
    const soulId = this.soulConfig.soul_id;
    await soulStateDataService.saveSoulState(this.sessionId, soulId, this.soulState);

    // 3. 更新 scheduled_wakeup 时间（数据库驱动的心跳调度）
    const heartbeat = this.soulConfig.heartbeat;
    if (heartbeat) {
      const jitter = heartbeat.jitter || 0;
      const delay = heartbeat.interval + (Math.random() * jitter - jitter / 2);

      // 直接更新数据库，不再使用回调
      await soulStateDataService.updateScheduledWakeup(this.sessionId, delay);

      console.log(`[SoulAgent] ${this.sessionId} scheduled next wakeup in ${Math.round(delay / 1000)}s`);
    }

    // 注意：不销毁实例，保持状态
    // 等待下次 execute() 调用或 periodic check cron 触发
  }

  /**
   * Public method to trigger hibernation
   * Called by SoulScheduler
   *
   * @param reason - Hibernate reason
   */
  async enterHibernation(reason: string): Promise<void> {
    await this.hibernate(reason);
  }

  /**
   * Wakeup from hibernation
   */
  async wakeup(): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} waking up`);

    // 1. Restore state from database
    const savedState = await soulStateDataService.getSoulState(this.sessionId);

    if (savedState) {
      this.soulState = savedState;
    }

    // 2. Update state
    this.soulState.status = 'ACTIVE';
    if (!this.soulState.activeSince) {
      this.soulState.activeSince = Date.now();
    }

    // 3. TODO: Notify scheduler
    // await SoulScheduler.wakeup(this);
  }

  /**
   * Get recent conversations from session state
   *
   * @param limit - Maximum number of conversations to return
   * @returns Recent conversations
   */
  private getRecentConversations(limit: number): Array<any> {
    const history = this.state.conversationHistory || [];
    return history.slice(-limit * 2); // Last N rounds (2 messages per round)
  }

  /**
   * Send message to user
   *
   * - Adds to Soul's own conversation history
   * - Adds to associated task's conversation history
   * - Pushes to taskExecution stream
   *
   * @param message - Message content
   * @returns Send result
   */
  private async sendMessage(message: string): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} sending message: ${message}`);

    try {
      const dataStore = getDataStore();
      await dataStore.initialize();

      // 确保 task context 存在
      const existingContext = await dataStore.getContext(this.taskId);
      if (!existingContext) {
        await dataStore.createTaskContext(this.taskId, this.sessionId, 'Soul Agent initiated message');
      }

      // 添加对话轮次
      await dataStore.addConversationRound(this.taskId, {
        round: Date.now(),
        timestamp: Date.now(),
        userMessage: null,  // Soul Agent 主动发起，没有用户消息
        assistantOutput: message,
        summary: '',
      });
      console.log(`[SoulAgent] ✅ Saved initiated message to task_contexts`);
    } catch (error) {
      console.error(`[SoulAgent] Failed to save message:`, error);
    }

    return {
      success: true,
      message: message,
      taskId: this.taskId,
      sessionId: this.sessionId,
      source: 'soul_agent',
      triggerSource: this.lastTriggerSource
    };
  }

  /**
   * Send push notification
   *
   * @param args - Notification arguments
   * @returns Send result
   */
  private async sendNotification(args: any): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} sending notification: ${args.title}`);

    try {
      // Create notification in database
      const notification = await soulNotificationDataService.createNotification(
        this.sessionId,
        this.soulConfig.soul_id,
        this.userId,
        args.title,
        args.body,
        args.urgency || 'medium'
      );

      // TODO: Send to actual push notification service (Firebase, APNs, etc.)
      // For now, mark as sent
      await soulNotificationDataService.updateNotificationStatus(notification.id, 'sent');

      console.log(`[SoulAgent] ${this.sessionId} notification created: ${notification.id}`);

      return {
        success: true,
        notificationId: notification.id,
        title: args.title,
        body: args.body
      };
    } catch (error: any) {
      console.error(`[SoulAgent] ${this.sessionId} failed to send notification: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete current task
   *
   * @param result - Task result
   * @returns Complete result
   */
  private async completeTask(_result: any): Promise<any> {
    this.soulState.statistics.totalTasks++;

    console.log(`[SoulAgent] ${this.sessionId} completed task. Total: ${this.soulState.statistics.totalTasks}`);

    // Save statistics to database
    const soulId = this.soulConfig.soul_id;
    await soulStateDataService.saveSoulState(this.sessionId, soulId, this.soulState);

    // Auto-hibernate if should
    if (this.shouldHibernate()) {
      await this.hibernate('任务完成');
    }

    return { success: true };
  }

  /**
   * Check if should hibernate
   *
   * @returns Whether should hibernate
   */
  private shouldHibernate(): boolean {
    if (!this.soulState.lastActivity) return false;

    const idleTime = Date.now() - this.soulState.lastActivity;
    return idleTime > this.soulConfig.hibernation.idle_timeout;
  }

  /**
   * Release memory
   */
  private releaseMemory(): void {
    // Clear temporary data
    // LLM context will be automatically cleared
    console.log(`[SoulAgent] ${this.sessionId} releasing memory`);
  }

  /**
   * Get soul state
   *
   * @returns Current soul state
   */
  getSoulState(): SoulState {
    return { ...this.soulState };
  }

  /**
   * Get soul configuration
   *
   * @returns Soul configuration
   */
  getSoulConfig(): SoulConfig {
    return { ...this.soulConfig };
  }

  /**
   * Get session ID (public getter)
   *
   * @returns Session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Update last activity timestamp
   * Called by SoulScheduler when soul is re-activated
   */
  updateLastActivity(): void {
    this.soulState.lastActivity = Date.now();
  }

  /**
   * Set last activity timestamp (for loading from database)
   * Used by soul-agent-executor to restore state from database
   *
   * @param timestamp - Last activity timestamp in milliseconds
   */
  setLastActivity(timestamp: number): void {
    this.soulState.lastActivity = timestamp;
  }
}
