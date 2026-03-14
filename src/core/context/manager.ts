/**
 * ContextManager - 上下文管理器
 *
 * 提供任务上下文的创建、更新、查询和压缩功能
 */

import type { TaskContext, ConversationRound, ConversationHistoryEntry } from '../database/context-types';
import { DataStore, getDataStore } from '../database/data-store';
import { ContextCompressor } from './compressor';
import { ArtifactExtractor } from './artifact-extractor';
import { LLMSummarizer } from '../llm/summarizer';

export class ContextManager {
  private store: DataStore;
  private compressor: ContextCompressor;
  private artifactExtractor: ArtifactExtractor;
  private summarizer?: LLMSummarizer;

  constructor(store?: DataStore, summarizer?: LLMSummarizer) {
    // 使用全局单例 DataStore，确保数据一致性
    this.store = store || getDataStore();
    this.compressor = new ContextCompressor();
    this.artifactExtractor = new ArtifactExtractor();
    this.summarizer = summarizer;
  }

  /**
   * 创建任务上下文
   *
   * 如果该 session 已有历史任务，则继承其上下文（conversationRounds, summary等）
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    // 1. 尝试获取该 taskId 的现有上下文（用于多轮对话）
    const existingContext = await this.getContext(taskId);

    // 2. 如果已有上下文，直接返回（多轮对话场景）
    if (existingContext && existingContext.conversationRounds.length > 0) {
      console.log('[ContextManager] Found existing context for taskId, reusing it', {
        taskId,
        conversationRoundsCount: existingContext.conversationRounds.length,
      });
      return existingContext;
    }

    // 3. 尝试获取该 session 最近的任务上下文（用于继承）
    const previousContext = await this.getMostRecentSessionContext(sessionId);

    // 4. 创建新上下文
    const context = await this.store.createTaskContext(taskId, sessionId, input);

    // 5. 如果有历史上下文，继承其 conversationRounds 和 summary
    if (previousContext) {
      console.log('[ContextManager] Found previous context for session', {
        sessionId,
        previousTaskId: previousContext.taskId,
        roundsCount: previousContext.conversationRounds?.length || 0,
      });

      // 继承 conversationRounds 和 summary，但使用新的 taskId
      context.conversationRounds = [...(previousContext.conversationRounds || [])];
      context.summary = { ...previousContext.summary };
      context.summary.currentTask = input; // 更新当前任务
      context.artifactIndex = [...previousContext.artifactIndex];
      context.workingMemory = { ...previousContext.workingMemory };
      context.metadata = { ...previousContext.metadata };

      // 保存更新后的上下文
      await this.store.saveContext(context);

      console.log('[ContextManager] Inherited context from previous task', {
        taskId,
        inheritedRounds: context.conversationRounds.length,
      });
    } else {
      // ⚠️ 修复：当找不到 previous context 时，从头开始创建新的 context
      console.warn('[ContextManager] No previous context found, starting fresh context');
      context.conversationRounds = [];
      context.summary = {
        sessionIntent: '',
        currentTask: input,
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      };
      context.artifactIndex = [];
      context.workingMemory = {};
      context.metadata = {};

      // 保存新创建的上下文
      await this.store.saveContext(context);
      console.log('[ContextManager] Started fresh context', {
        taskId,
        roundsCount: context.conversationRounds.length,
      });

      return context;
    }

    return context;
  }

  /**
   * 获取指定 session 最近的任务上下文
   */
  private async getMostRecentSessionContext(sessionId: string): Promise<TaskContext | null> {
    console.log('[ContextManager] Looking for previous context in session:', sessionId);

    // 查询该 session 最近的任务
    const tasksResult = await this.store.listTasks({
      sessionId,
      limit: 10,
      status: undefined as any // 获取所有状态的任务
    });

    console.log('[ContextManager] Found tasks in session:', {
      sessionId,
      totalTasks: tasksResult.total,
      taskIds: tasksResult.tasks.map(t => t.id)
    });

    if (tasksResult.tasks.length === 0) {
      console.log('[ContextManager] No tasks found in session');
      return null;
    }

    // 找到最近一个有上下文的任务
    for (const task of tasksResult.tasks) {
      console.log('[ContextManager] Checking task for context:', task.id);
      const context = await this.store.getContext(task.id);
      if (context) {
        console.log('[ContextManager] Found context for task:', {
          taskId: task.id,
          conversationRoundsCount: context.conversationRounds.length,
        });
        // ⭐ 修复：改为检查 conversationRounds 而不是 messages
        if (context.conversationRounds.length > 0) {
          console.log('[ContextManager] Using this context as previous context');
          return context;
        }
      }
    }

    console.log('[ContextManager] No task with conversationRounds found in session');
    return null;
  }

  /**
   * 获取任务上下文
   */
  async getContext(taskId: string): Promise<TaskContext | null> {
    return await this.store.getContext(taskId);
  }

  /**
   * 保存上下文
   */
  async saveContext(context: TaskContext): Promise<void> {
    await this.store.saveContext(context);
  }

  /**
   * 获取上下文用于LLM (Legacy - 用于向后兼容)
   * @deprecated 使用 getContextForLLM(taskId, currentMessage) 代替
   */
  async getContextForLLMLegacy(taskId: string): Promise<string> {
    const context = await this.getContext(taskId);
    if (!context) {
      return '';
    }

    return this.formatContextForLLM(context);
  }

  /**
   * 格式化上下文为LLM输入 (Legacy)
   * @deprecated 使用 formatConversationHistory 代替
   */
  private formatContextForLLM(context: TaskContext): string {
    const summary = this.formatSummary(context.summary);
    const artifacts = this.formatArtifacts(context.artifactIndex);
    const rounds = this.formatRounds(context.conversationRounds);

    return `
## Summary
${summary}

## Artifacts
${artifacts}

## Recent Conversation
${rounds}
`.trim();
  }

  /**
   * 格式化摘要
   */
  private formatSummary(summary: any): string {
    return `
- Session Intent: ${summary.sessionIntent || '未定义'}
- Current Task: ${summary.currentTask || '未定义'}
- Status: ${summary.currentStatus || 'pending'}
- Completed Steps: ${summary.completedSteps?.join(', ') || '无'}
- Files Modified: ${summary.filesModified?.map((f: any) => `${f.action}: ${f.path}`).join(', ') || '无'}
- Decisions: ${summary.decisionsMade?.map((d: any) => d.topic).join(', ') || '无'}
`.trim();
  }

  /**
   * 格式化Artifacts
   */
  private formatArtifacts(artifacts: any[]): string {
    if (artifacts.length === 0) {
      return 'No artifacts tracked yet.';
    }

    return artifacts
      .map(a => `- ${a.artifactType}: ${a.action} ${a.path}`)
      .join('\n');
  }

  /**
   * 格式化对话轮次
   */
  private formatRounds(rounds: ConversationRound[]): string {
    return rounds
      .map(r => `[User]: ${r.userMessage}\n${r.assistantOutput ? `[Assistant]: ${r.assistantOutput}` : ''}`)
      .join('\n\n');
  }

  /**
   * 格式化 UserProfile 为 LLM 友好的文本
   *
   * 将通用用户画像（preferences, habits, tags）格式化为 prompt 片段
   *
   * @param userProfile - 用户画像对象
   * @returns 格式化后的文本
   */
  formatUserProfile(userProfile: any | null): string {
    if (!userProfile) return '';

    const parts: string[] = [];

    if (userProfile.preferences?.length) {
      parts.push(`**偏好**: ${userProfile.preferences.join('、')}`);
    }
    if (userProfile.habits?.length) {
      parts.push(`**习惯**: ${userProfile.habits.join('、')}`);
    }
    if (userProfile.tags?.length) {
      parts.push(`**标签**: ${userProfile.tags.join('、')}`);
    }

    return parts.length ? `## 用户画像\n${parts.join('\n')}` : '';
  }

  /**
   * 格式化 userContext 为 LLM 友好的文本
   *
   * 将应用层传入的 userContext 格式化为 prompt 片段
   * 支持 UserContext 推荐结构，也兼容任意 Record<string, any>
   *
   * @param userContext - 用户上下文对象
   * @returns 格式化后的文本
   */
  formatUserContext(userContext: Record<string, any> | null): string {
    if (!userContext || Object.keys(userContext).length === 0) return '';

    const parts: string[] = [];

    // AI 身份信息
    if (userContext.name || userContext.personality) {
      parts.push('### AI 角色信息');
      if (userContext.name) parts.push(`- 名字: ${userContext.name}`);
      if (userContext.personality) parts.push(`- 性格: ${userContext.personality}`);
      if (userContext.age) parts.push(`- 年龄: ${userContext.age}`);
    }

    // 用户信息
    if (userContext.user_mood || userContext.user_needs || userContext.user_style) {
      parts.push('### 用户信息');
      if (userContext.user_mood) parts.push(`- 当前状态: ${userContext.user_mood}`);
      if (userContext.user_needs) parts.push(`- 情感需求: ${userContext.user_needs}`);
      if (userContext.user_style) parts.push(`- 沟通风格: ${userContext.user_style}`);
    }

    // 关系信息
    if (userContext.intimacy_level || userContext.chat_days || userContext.nickname) {
      parts.push('### 关系信息');
      if (userContext.intimacy_level) parts.push(`- 亲密度: ${userContext.intimacy_level}/10`);
      if (userContext.chat_days) parts.push(`- 相处天数: ${userContext.chat_days} 天`);
      if (userContext.nickname) parts.push(`- 昵称: ${userContext.nickname}`);
    }

    // 自定义提示
    if (userContext.custom_hint) {
      parts.push(`### 特别提示\n${userContext.custom_hint}`);
    }

    return parts.length ? `## 用户上下文\n${parts.join('\n')}` : '';
  }

  /**
   * 添加对话轮次到上下文
   *
   * @param taskId - 任务ID
   * @param round - 对话轮次数据
   * @returns 更新后的上下文
   */
  async addConversationRound(taskId: string, round: ConversationRound): Promise<TaskContext> {
    return await this.store.addConversationRound(taskId, round);
  }

  /**
   * 获取对话历史供 Agent 使用
   * 将 conversationRounds 转换为 Agent 需要的格式
   *
   * @param context - 任务上下文
   * @returns 对话历史条目数组
   */
  getConversationHistoryForAgent(context: TaskContext): ConversationHistoryEntry[] {
    if (!context.conversationRounds || context.conversationRounds.length === 0) {
      return [];
    }

    return context.conversationRounds.flatMap(round => {
      const timestamp = round.timestamp instanceof Date ? round.timestamp.getTime() : round.timestamp;
      const entries: ConversationHistoryEntry[] = [
        { role: 'user', content: round.userMessage, timestamp },
      ];

      const reply = round.assistantOutput || round.assistantReply;
      if (reply) {
        entries.push({ role: 'assistant', content: reply, timestamp });
      }

      return entries;
    });
  }

  /**
   * 添加 Skill 执行记录到 TaskContext
   */
  async addSkillExecution(record: {
    id: string;
    taskId: string;
    skillName: string;
    success: boolean;
    startedAt: Date;
    completedAt: Date;
    duration: number;
    inputSummary: string;
    outputType?: string;
    scenario?: string;
    error?: string;
  }): Promise<void> {
    const context = await this.getContext(record.taskId);
    if (!context) {
      throw new Error(`Task context not found: ${record.taskId}`);
    }

    if (!context.skillExecutionHistory) {
      context.skillExecutionHistory = [];
    }

    // 保留策略：最多 200 条
    const maxRecords = context.executionHistoryConfig?.maxSkillRecords || 200;
    if (context.skillExecutionHistory.length >= maxRecords) {
      context.skillExecutionHistory.sort((a: any, b: any) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
      );
      context.skillExecutionHistory = context.skillExecutionHistory.slice(1);
    }

    context.skillExecutionHistory.push(record);
    await this.store.saveContext(context);
  }

  /**
   * 添加 Tool 使用记录到 TaskContext
   */
  async addToolUsage(record: {
    id: string;
    taskId: string;
    toolName: string;
    success: boolean;
    timestamp: Date;
    summary: string;
    error?: string;
  }): Promise<void> {
    const context = await this.getContext(record.taskId);
    if (!context) {
      throw new Error(`Task context not found: ${record.taskId}`);
    }

    if (!context.toolUsageHistory) {
      context.toolUsageHistory = [];
    }

    // 保留策略：最多 500 条
    const maxRecords = context.executionHistoryConfig?.maxToolRecords || 500;
    if (context.toolUsageHistory.length >= maxRecords) {
      context.toolUsageHistory.sort((a: any, b: any) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      context.toolUsageHistory = context.toolUsageHistory.slice(1);
    }

    context.toolUsageHistory.push(record);
    await this.store.saveContext(context);
  }

  /**
   * 添加失败经验到 TaskContext.summary.errorsAndSolutions
   */
  async addFailureExperience(
    taskId: string,
    experience: {
      error: string;
      solution: string;
      timestamp: Date;
      skillName?: string;
      scenario?: string;
    }
  ): Promise<void> {
    const context = await this.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    if (!context.summary) {
      context.summary = {
        sessionIntent: '',
        currentTask: '',
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      };
    }

    if (!context.summary.errorsAndSolutions) {
      context.summary.errorsAndSolutions = [];
    }

    // 保留策略：最多 100 条失败经验
    const maxRecords = 100;
    if (context.summary.errorsAndSolutions.length >= maxRecords) {
      context.summary.errorsAndSolutions.sort((a: any, b: any) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      context.summary.errorsAndSolutions = context.summary.errorsAndSolutions.slice(1);
    }

    context.summary.errorsAndSolutions.push({
      error: experience.error,
      solution: experience.solution,
      timestamp: experience.timestamp,
    });

    await this.store.saveContext(context);
  }
}
