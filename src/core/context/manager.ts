/**
 * ContextManager - 上下文管理器
 *
 * 提供任务上下文的创建、更新、查询和压缩功能
 */

import type { TaskContext, Message } from '../database/context-types';
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
   * 如果该 session 已有历史任务，则继承其上下文（messages, summary等）
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    // 1. 尝试获取该 session 最近的任务上下文
    const previousContext = await this.getMostRecentSessionContext(sessionId);

    // 2. 创建新上下文
    const context = await this.store.createTaskContext(taskId, sessionId, input);

    // 3. 如果有历史上下文，继承其 messages 和 summary
    if (previousContext) {
      console.log('[ContextManager] Found previous context for session', {
        sessionId,
        previousTaskId: previousContext.taskId,
        messagesCount: previousContext.messages.length,
        currentTurn: previousContext.currentTurn
      });

      // 继承 messages 和 summary，但使用新的 taskId
      context.messages = [...previousContext.messages];
      context.currentTurn = previousContext.currentTurn;
      context.summary = { ...previousContext.summary };
      context.summary.currentTask = input; // 更新当前任务
      context.artifactIndex = [...previousContext.artifactIndex];
      context.workingMemory = { ...previousContext.workingMemory };
      context.metadata = { ...previousContext.metadata };

      // 保存更新后的上下文
      await this.store.saveContext(context);

      console.log('[ContextManager] Inherited context from previous task', {
        taskId,
        inheritedMessages: context.messages.length,
        inheritedTurn: context.currentTurn
      });
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
          messagesCount: context.messages.length,
          currentTurn: context.currentTurn
        });
        if (context.messages.length > 0) {
          console.log('[ContextManager] Using this context as previous context');
          return context;
        }
      }
    }

    console.log('[ContextManager] No task with messages found in session');
    return null;
  }

  /**
   * 获取任务上下文
   */
  async getContext(taskId: string): Promise<TaskContext | null> {
    return await this.store.getContext(taskId);
  }

  /**
   * 添加消息到上下文
   */
  async addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext> {
    // 1. 获取当前上下文，如果不存在则创建一个新的
    let context = await this.store.getContext(taskId);
    if (!context) {
      console.warn(`[ContextManager] Context not found for task ${taskId}, creating new context`);
      // 创建一个新的任务上下文（使用默认值）
      context = await this.store.createTaskContext(taskId, message.metadata?.sessionId || 'default-session', '');
    }

    // 2. 添加消息
    const updatedContext = await this.store.addMessage(taskId, message);

    // 3. 提取并保存Artifacts
    const artifacts = this.artifactExtractor.extractFromMessage({
      ...message,
      taskId,
    });

    for (const artifact of artifacts) {
      await this.store.addArtifact({ ...artifact, taskId });
    }

    // 4. 检查是否需要压缩
    if (this.compressor.shouldCompress(updatedContext)) {
      // 生成压缩摘要
      const llmSummarize = async (messages: Message[]) => {
        if (this.summarizer) {
          return await this.summarizer.summarizeContext(messages);
        } else {
          // Fallback: 简单摘要
          return {
            sessionIntent: '会话意图',
            currentTask: context.summary.currentTask,
            completedSteps: messages.map(m => m.content).slice(0, 5),
            filesModified: [],
            decisionsMade: [],
            currentStatus: 'compressed',
            nextSteps: [],
            errorsAndSolutions: [],
            technicalDetails: {},
          };
        }
      };

      const compressed = await this.compressor.compress(updatedContext, llmSummarize);

      // 5. 保存压缩历史
      await this.store.saveCompressionHistory({
        id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        taskId,
        compressedAt: new Date(),
        originalTokenCount: updatedContext.metadata.totalTokens,
        compressedTokenCount: compressed.metadata.totalTokens,
        compressionRatio:
          compressed.metadata.totalTokens / updatedContext.metadata.totalTokens,
        summary: compressed.summary,
        truncatedMessageIds: updatedContext.messages
          .slice(0, -20)
          .map(m => m.id),
      });

      // 6. 保存压缩后的上下文
      await this.store.saveContext(compressed);

      return compressed;
    }

    return updatedContext;
  }

  /**
   * 保存上下文
   */
  async saveContext(context: TaskContext): Promise<void> {
    await this.store.saveContext(context);
  }

  /**
   * 获取上下文用于LLM
   */
  async getContextForLLM(taskId: string): Promise<string> {
    const context = await this.getContext(taskId);
    if (!context) {
      return '';
    }

    return this.formatContextForLLM(context);
  }

  /**
   * 格式化上下文为LLM输入
   */
  private formatContextForLLM(context: TaskContext): string {
    const summary = this.formatSummary(context.summary);
    const artifacts = this.formatArtifacts(context.artifactIndex);
    const messages = this.formatMessages(context.messages);

    return `
## Summary
${summary}

## Artifacts
${artifacts}

## Recent Messages
${messages}
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
   * 格式化消息
   */
  private formatMessages(messages: Message[]): string {
    return messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');
  }
}
