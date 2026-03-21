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
import { soulConfigLoader } from '../config/soul-config-loader';
import { subagentConfigLoader } from '../config/subagent-config-loader';
import { SoulContextManager } from '../context/soul-context-manager';
import { soulStateDataService } from '../database/soul-data-service';
import { soulExecutionHistoryService } from '../database/soul-data-service';
import { soulNotificationDataService } from '../database/soul-notification-service';
import { SoulExecutionRecord } from './soul-execution-types';
import { extractUserId } from '../utils/session-utils';
import { createExecutionId, calculateDuration } from '../utils/date-utils';
import { MAX_DECISION_LENGTH, DEFAULT_TASK_NAME } from '../constants/execution';
import { getDataStore } from '../database/data-store';

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
      currentTask: null,
      lastActivity: null,
      scheduledWakeup: null,
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
   * Execute trigger task (main entry point for Soul)
   *
   * Completely generic, contains no business logic.
   * All business logic is defined in soul.yaml's goal field.
   *
   * Implementation: 复用父类 Agent 的 run() 方法
   * - 自动推送 taskExecution stream
   * - 自动推送 taskResult stream
   * - 执行完成后回到 idle 状态
   *
   * @param input - Soul execution input
   * @returns Execution result
   */
  async execute(input: SoulInput): Promise<any> {
    const { trigger_time, context } = input;

    // 记录触发源和时间
    this.lastTriggerSource = context.source;
    this.lastTriggerTime = trigger_time;

    console.log(`[SoulAgent] ${this.sessionId} executing at ${trigger_time}, source: ${context.source}`);

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

    // Get dataStore for task status updates
    const dataStore = getDataStore();

    try {
      // 1. 更新主任务状态为 'running'
      try {
        await dataStore.initialize();
        const task = await dataStore.getTask(this.taskId);
        if (task) {
          // 更新任务描述为用户消息
          const taskDescription = this.buildTaskPrompt(trigger_time, context);
          await dataStore.updateTask(this.taskId, {
            status: 'running',
            task: taskDescription.substring(0, 200)  // 限制长度
          });
          console.log(`[SoulAgent] Updated main task status to running: ${this.taskId}`);
        }
      } catch (error) {
        console.error(`[SoulAgent] Failed to update main task status:`, error);
      }

      // 2. Update state
      this.soulState.status = 'ACTIVE';
      this.soulState.lastActivity = Date.now();
      this.soulState.currentTask = executionRecord.id;

      // 3. Build task prompt (根据触发源构建)
      const taskPrompt = this.buildTaskPrompt(trigger_time, context);

      // Update execution record with task info
      executionRecord.currentTask = `Execute soul: ${context.source}`;

      // 4. === 核心：调用父类的 run()，复用现有执行流程 ===
      const result = await this.run(
        taskPrompt,
        `soul-execution-${Date.now()}`,
        {
          // 注入原语工具
          tools: this.getPrimitiveTools()
        }
      );

      // 5. 记录执行结果
      if (result.output) {
        executionRecord.llmThoughtProcess = 'Soul decided on action based on goal and context';
        executionRecord.llmDecision = result.output.substring(0, MAX_DECISION_LENGTH);
      }

      // 6. 更新执行记录
      executionRecord.status = 'completed';
      executionRecord.completedAt = new Date();
      executionRecord.duration = calculateDuration(executionRecord.startedAt, executionRecord.completedAt);
      executionRecord.output = {
        output: result.output,
        steps: result.steps?.length || 0
      };

      await soulExecutionHistoryService.saveExecution(executionRecord);

      // 7. === 执行完成后回到 idle 状态（等待下次触发）===
      // 更新主任务状态回 'idle'
      try {
        await dataStore.updateTask(this.taskId, {
          status: 'idle'
        });
        console.log(`[SoulAgent] Updated main task status back to idle: ${this.taskId}`);
      } catch (error) {
        console.error(`[SoulAgent] Failed to update main task status to idle:`, error);
      }

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
      // 更新主任务状态回 'idle'
      try {
        await dataStore.updateTask(this.taskId, {
          status: 'idle'
        });
        console.log(`[SoulAgent] Updated main task status back to idle after error: ${this.taskId}`);
      } catch (err) {
        console.error(`[SoulAgent] Failed to update main task status to idle:`, err);
      }

      await this.hibernate(`执行失败: ${error.message}`);

      throw error;
    }
  }

  /**
   * Build task prompt
   *
   * 根据触发源动态构建任务提示
   *
   * @param trigger_time - Trigger timestamp
   * @param triggerContext - Trigger context from application
   * @returns Task prompt string
   */
  private buildTaskPrompt(trigger_time: string, triggerContext: any): string {
    const { source, data } = triggerContext;

    // 根据触发源构建不同的提示
    if (source === 'user_message') {
      // 用户主动发消息
      return `用户发来消息：${data.userRequest || data.message || '(无内容)'}`;
    } else if (source === 'soul_schedule') {
      // 定时唤醒
      return `现在是 ${new Date(trigger_time).toLocaleString()}，根据你的长期目标（goal）判断是否需要主动行动。`;
    } else if (source === 'emotion_detection') {
      // 情绪检测触发
      return `检测到用户情绪变化：${JSON.stringify(data)}，根据你的目标判断是否需要关心。`;
    } else if (source === 'webhook') {
      // Webhook 触发
      return `收到 webhook 事件：${JSON.stringify(data)}，根据你的目标判断是否需要响应。`;
    } else {
      // 其他触发源
      return `触发时间：${trigger_time}，触发源：${source}，数据：${JSON.stringify(data || {})}`;
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
        name: 'schedule',
        description: '安排下次任务或唤醒',
        parameters: {
          type: 'object',
          properties: {
            trigger_config: { type: 'object', description: '触发器配置' }
          },
          required: ['trigger_config']
        },
        implementation: async (args) => {
          return await this.scheduleNext(args);
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

            case 'schedule':
              console.log(`[SoulAgent] ${this.sessionId} scheduled next wakeup`);
              callRecord.result = { scheduled: true };
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
   * - 等待下次触发
   *
   * @param reason - Hibernate reason
   */
  private async hibernate(reason: string): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} hibernating: ${reason}`);

    // 1. 更新状态为 IDLE（不是 HIBERNATED，区别在于：IDLE 等待下次触发，HIBERNATED 是长期休眠）
    this.soulState.status = 'IDLE';
    this.soulState.currentTask = null;

    // 2. 保存状态到数据库
    const soulId = this.soulConfig.soul_id;
    await soulStateDataService.saveSoulState(this.sessionId, soulId, this.soulState);

    // 注意：不销毁实例，保持状态
    // 等待下次 execute() 调用
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

    // 3. TODO: Notify scheduler
    // await SoulScheduler.wakeup(this);
  }

  /**
   * Load context (user profile, conversations, relationship state)
   *
   * @returns Application context
   */
  private async loadContext(): Promise<any> {
    const contextManager = new SoulContextManager();

    return {
      userProfile: await contextManager.getUserProfile(this.sessionId),
      recentConversations: await contextManager.getRecentConversations(this.sessionId, 10),
      relationship: await contextManager.getRelationshipState(this.sessionId)
    };
  }

  /**
   * Save context updates
   *
   * @param context - Context to save
   */
  private async saveContext(context: any): Promise<void> {
    const contextManager = new SoulContextManager();
    await contextManager.updateContext(this.sessionId, context);
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

    const contextManager = new SoulContextManager();

    // 1. Add to Soul's own conversation history (保持现有逻辑)
    await contextManager.addConversationMessage(this.sessionId, 'assistant', message);

    // 2. Add to associated task's conversation history
    // 这里需要访问 streams 和 DataStore
    // 注意：这个方法需要接收 streams 参数，或者从其他地方获取
    // 暂时先返回成功，具体的 task 集成在 execute 方法中处理

    // TODO: 通过 taskExecution stream 推送消息
    // TODO: 添加到 task 的对话历史数据库

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
   * Schedule next wakeup
   *
   * @param args - Schedule arguments
   * @returns Schedule result
   */
  private async scheduleNext(args: any): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} scheduling next wakeup`);

    try {
      const triggerConfig = args.trigger_config;

      if (!triggerConfig) {
        throw new Error('trigger_config is required for schedule');
      }

      // Calculate scheduled wakeup time based on trigger type
      let scheduledWakeupTime: number | null = null;

      if (triggerConfig.type === 'delay') {
        // Schedule after delay milliseconds
        const delay = triggerConfig.delay || 0;
        scheduledWakeupTime = Date.now() + delay;
      } else if (triggerConfig.type === 'timestamp') {
        // Schedule at specific timestamp
        scheduledWakeupTime = triggerConfig.timestamp;
      } else if (triggerConfig.type === 'cron') {
        // Calculate next cron time
        // TODO: Implement cron parsing
        // For now, require timestamp to be provided
        if (!triggerConfig.next_timestamp) {
          throw new Error('next_timestamp is required for cron scheduling');
        }
        scheduledWakeupTime = triggerConfig.next_timestamp;
      }

      if (!scheduledWakeupTime) {
        throw new Error('Could not determine scheduled wakeup time');
      }

      // Update soul state with scheduled wakeup
      this.soulState.scheduledWakeup = scheduledWakeupTime;

      // Save to database
      await soulStateDataService.saveSoulState(
        this.sessionId,
        this.soulConfig.soul_id,
        this.soulState
      );

      // TODO: Register with scheduling system (e.g., node-cron, agenda)
      // For now, the scheduled wakeup is stored in database and can be queried
      // The application layer should periodically check for scheduled wakeups

      console.log(`[SoulAgent] ${this.sessionId} scheduled wakeup at ${new Date(scheduledWakeupTime).toISOString()}`);

      return {
        success: true,
        scheduledWakeup: scheduledWakeupTime,
        scheduledAt: new Date(scheduledWakeupTime).toISOString()
      };
    } catch (error: any) {
      console.error(`[SoulAgent] ${this.sessionId} failed to schedule: ${error.message}`);
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
  private async completeTask(result: any): Promise<any> {
    this.soulState.statistics.totalTasks++;

    console.log(`[SoulAgent] ${this.sessionId} completed task. Total: ${this.soulState.statistics.totalTasks}`);

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
}
