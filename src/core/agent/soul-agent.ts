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

/**
 * SoulAgent - Autonomous agent with hibernation capabilities
 */
export class SoulAgent extends Agent {
  private soulConfig: SoulConfig;
  private subagentConfig: any;
  private soulState: SoulState;

  /**
   * Create a new SoulAgent instance
   *
   * @param soulConfig - Soul configuration from soul.yaml
   * @param subagentConfig - Subagent configuration
   * @param sessionId - Session identifier
   */
  constructor(
    soulConfig: SoulConfig,
    subagentConfig: any,
    sessionId: string
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

    // 5. Initialize Soul state
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

    console.log(`[SoulAgent] Created soul agent: ${soulConfig.soul_id} (${soulConfig.display_name})`);
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
   * @param input - Soul execution input
   * @returns Execution result
   */
  async execute(input: SoulInput): Promise<any> {
    const { trigger_time, context } = input;

    console.log(`[SoulAgent] ${this.sessionId} executing at ${trigger_time}`);

    // 1. Update state
    this.soulState.status = 'ACTIVE';
    this.soulState.lastActivity = Date.now();

    // 2. Load context (conversation history, user profile, etc.)
    const appContext = await this.loadContext();

    // 3. Build task prompt (dynamic, different each time)
    const taskPrompt = this.buildTaskPrompt(trigger_time, context, appContext);

    // 4. Execute LLM
    const result = await this.run(
      taskPrompt,
      `soul-execution-${Date.now()}`,
      {
        // Inject primitive tools
        tools: this.getPrimitiveTools()
      }
    );

    // 5. Handle primitive calls
    await this.handlePrimitives(result);

    // 6. Save context updates
    await this.saveContext(appContext);

    return result;
  }

  /**
   * Build task prompt
   *
   * Dynamically generated each execution, contains current trigger and context
   * Completely generic, contains no business logic
   *
   * @param trigger_time - Trigger timestamp
   * @param triggerContext - Trigger context from application
   * @param appContext - Application context (user profile, conversations, etc.)
   * @returns Task prompt string
   */
  private buildTaskPrompt(
    trigger_time: string,
    triggerContext: any,
    appContext: any
  ): string {
    return `
## 当前情况

触发时间：${trigger_time}
触发来源：${triggerContext.source}
上下文数据：${JSON.stringify(triggerContext.data, null, 2)}

## 用户信息

${JSON.stringify(appContext.userProfile || {}, null, 2)}

## 最近对话

${(appContext.recentConversations || []).map((c: any) => `- ${c.role}: ${c.content}`).join('\n')}

## 关系状态

- 亲密度：${appContext.relationship?.intimacy || 0}/100
- 最后互动：${appContext.relationship?.lastInteraction || '未知'}

## 提示

根据你的目标（goal）和当前情况，判断是否需要主动行动。

## 可用原语

- hibernate(reason): 进入休眠，释放资源
- schedule(trigger_config): 调度下次唤醒
- send_message(message): 发送消息给用户
- send_notification(title, body, urgency): 发送推送通知
- complete(result): 标记当前任务完成

## 请行动

根据当前时间和上下文，判断是否需要行动。
如果不需要行动，调用 hibernate() 休眠。
如果需要行动，直接执行，完成后调用 hibernate()。
    `.trim();
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
   * Check LLM execution result for primitive calls
   *
   * @param result - Agent execution result
   */
  private async handlePrimitives(result: any): Promise<void> {
    if (!result.steps) return;

    for (const step of result.steps) {
      if (!step.toolCalls) continue;

      for (const toolCall of step.toolCalls) {
        switch (toolCall.name) {
          case 'hibernate':
            console.log(`[SoulAgent] ${this.sessionId} hibernating: ${toolCall.arguments?.reason}`);
            break;

          case 'schedule':
            console.log(`[SoulAgent] ${this.sessionId} scheduled next wakeup`);
            break;

          case 'complete':
            console.log(`[SoulAgent] ${this.sessionId} completed task`);
            break;
        }
      }
    }
  }

  /**
   * Primitive: Hibernate
   *
   * @param reason - Hibernate reason
   */
  private async hibernate(reason: string): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} hibernating: ${reason}`);

    // 1. Update state
    this.soulState.status = 'HIBERNATED';

    // 2. TODO: Save state to database
    // await getDataStore().saveSoulState(this.sessionId, this.soulState);

    // 3. Release memory
    this.releaseMemory();

    // 4. TODO: Notify scheduler
    // await SoulScheduler.hibernate(this);
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

    // 1. TODO: Restore state from database
    // this.soulState = await getDataStore().getSoulState(this.sessionId);

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
    // TODO: Load from database when schema is ready
    // For now, return empty context
    return {
      userProfile: {},
      recentConversations: await this.getRecentConversations(10),
      relationship: {}
    };
  }

  /**
   * Save context updates
   *
   * @param context - Context to save
   */
  private async saveContext(context: any): Promise<void> {
    // TODO: Save to database when schema is ready
    console.log(`[SoulAgent] ${this.sessionId} saving context (not implemented yet)`);
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
   * @param message - Message content
   * @returns Send result
   */
  private async sendMessage(message: string): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} sending message: ${message}`);

    // TODO: Implement actual message sending logic
    // await getDataStore().saveMessage(this.sessionId, {
    //   role: 'assistant',
    //   content: message,
    //   timestamp: Date.now()
    // });

    return { success: true, message };
  }

  /**
   * Send push notification
   *
   * @param args - Notification arguments
   * @returns Send result
   */
  private async sendNotification(args: any): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} sending notification: ${args.title}`);

    // TODO: Implement actual notification sending logic

    return { success: true };
  }

  /**
   * Schedule next wakeup
   *
   * @param args - Schedule arguments
   * @returns Schedule result
   */
  private async scheduleNext(args: any): Promise<any> {
    console.log(`[SoulAgent] ${this.sessionId} scheduling next wakeup`);

    // TODO: Implement actual scheduling logic

    return { success: true };
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
