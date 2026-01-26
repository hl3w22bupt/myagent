/**
 * ContextManager - 上下文管理器
 *
 * 提供任务上下文的创建、更新、查询和压缩功能
 */

import type { TaskContext, Message } from '../database/context-types';
import { ContextStore } from '../database/context-store';
import { ContextCompressor } from './compressor';
import { ArtifactExtractor } from './artifact-extractor';
import { LLMSummarizer } from '../llm/summarizer';

export class ContextManager {
  private store: ContextStore;
  private compressor: ContextCompressor;
  private artifactExtractor: ArtifactExtractor;
  private summarizer?: LLMSummarizer;

  constructor(store?: ContextStore, summarizer?: LLMSummarizer) {
    this.store = store || new ContextStore();
    this.compressor = new ContextCompressor();
    this.artifactExtractor = new ArtifactExtractor();
    this.summarizer = summarizer;
  }

  /**
   * 创建任务上下文
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    const context = await this.store.createTaskContext(taskId, sessionId, input);

    return context;
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
    // 1. 获取当前上下文
    const context = await this.store.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
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
- Session Intent: ${summary.sessionIntent}
- Current Task: ${summary.currentTask}
- Status: ${summary.currentStatus}
- Completed Steps: ${summary.completedSteps.join(', ')}
- Files Modified: ${summary.filesModified.map((f: any) => `${f.action}: ${f.path}`).join(', ')}
- Decisions: ${summary.decisionsMade.map((d: any) => d.topic).join(', ')}
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
