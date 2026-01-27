/**
 * 上下文压缩器
 *
 * 使用Anchored Iterative Summarization算法压缩上下文
 */

import type { TaskContext, StructuredSummary, Message } from '../database/context-types';

export class ContextCompressor {
  private maxTokens: number;
  private threshold: number;
  private messagesToKeep: number;

  constructor(
    maxTokens: number = 100000,
    threshold: number = 0.8,
    messagesToKeep: number = 20
  ) {
    this.maxTokens = maxTokens;
    this.threshold = threshold;
    this.messagesToKeep = messagesToKeep;
  }

  /**
   * 检查是否需要压缩（智能触发）
   */
  shouldCompress(context: TaskContext): boolean {
    const { totalTokens, lastCompressedAt } = context.metadata;

    // 条件1: Token数超过阈值
    if (totalTokens > this.maxTokens * this.threshold) {
      return true;
    }

    // 条件2: 最近一次压缩后超过50条新消息
    if (lastCompressedAt && context.messages.length > 50) {
      const messagesSinceCompression = context.messages.filter(
        m => new Date(m.metadata.timestamp) > new Date(lastCompressedAt)
      );
      if (messagesSinceCompression.length > 50) {
        return true;
      }
    }

    // 条件3: 任务状态为completed或failed时
    if (context.summary.currentStatus === 'completed' ||
        context.summary.currentStatus === 'failed') {
      return true;
    }

    return false;
  }

  /**
   * 压缩上下文
   */
  async compress(
    context: TaskContext,
    llmSummarize: (messages: Message[]) => Promise<StructuredSummary>
  ): Promise<TaskContext> {
    // 1. 分离要压缩的消息和要保留的消息
    const messagesToCompress = context.messages.slice(0, -this.messagesToKeep);
    const messagesToKeep = context.messages.slice(-this.messagesToKeep);

    if (messagesToCompress.length === 0) {
      return context;
    }

    // 2. 生成新的结构化摘要
    const newSummary = await llmSummarize(messagesToCompress);

    // 3. 合并摘要
    const mergedSummary = this.mergeSummaries(context.summary, newSummary);

    // 4. 更新Artifact索引
    const updatedArtifacts = this.extractArtifactsFromMessages(messagesToCompress);

    // 5. 创建压缩后的上下文
    const compressedContext: TaskContext = {
      ...context,
      messages: messagesToKeep,
      summary: mergedSummary,
      artifactIndex: [...context.artifactIndex, ...updatedArtifacts],
      metadata: {
        ...context.metadata,
        lastCompressedAt: new Date(),
        totalTokens: this.estimateCompressedTokens(messagesToKeep, mergedSummary),
      },
    };

    return compressedContext;
  }

  /**
   * 合并两个摘要
   */
  private mergeSummaries(
    existing: StructuredSummary,
    newSummary: StructuredSummary
  ): StructuredSummary {
    return {
      sessionIntent: existing.sessionIntent || newSummary.sessionIntent,
      currentTask: newSummary.currentTask || existing.currentTask,
      completedSteps: [...existing.completedSteps, ...newSummary.completedSteps],
      filesModified: [...existing.filesModified, ...newSummary.filesModified],
      decisionsMade: [...existing.decisionsMade, ...newSummary.decisionsMade],
      currentStatus: newSummary.currentStatus || existing.currentStatus,
      nextSteps: newSummary.nextSteps || existing.nextSteps,
      errorsAndSolutions: [...existing.errorsAndSolutions, ...newSummary.errorsAndSolutions],
      technicalDetails: {
        functionNames: [
          ...(existing.technicalDetails.functionNames || []),
          ...(newSummary.technicalDetails.functionNames || []),
        ],
        errorCodes: [
          ...(existing.technicalDetails.errorCodes || []),
          ...(newSummary.technicalDetails.errorCodes || []),
        ],
        dependencies: [
          ...(existing.technicalDetails.dependencies || []),
          ...(newSummary.technicalDetails.dependencies || []),
        ],
      },
    };
  }

  /**
   * 从消息中提取Artifacts
   */
  private extractArtifactsFromMessages(messages: Message[]): any[] {
    // 简化版本：实际应该使用ArtifactExtractor
    const artifacts: any[] = [];

    for (const message of messages) {
      if (message.metadata.skillCalls) {
        for (const skill of message.metadata.skillCalls) {
          artifacts.push({
            artifactType: 'function',
            action: 'read',
            path: skill,
            timestamp: message.metadata.timestamp,
          });
        }
      }
    }

    return artifacts;
  }

  /**
   * 估算压缩后的token数
   */
  private estimateCompressedTokens(messages: Message[], _summary: StructuredSummary): number {
    // 简单估算：每条消息平均1000 tokens，摘要5000 tokens
    const messageTokens = messages.length * 1000;
    const summaryTokens = 5000;

    return messageTokens + summaryTokens;
  }
}
