/**
 * 上下文压缩器
 *
 * 使用Anchored Iterative Summarization算法压缩上下文
 */

import type { TaskContext, StructuredSummary, ConversationRound } from '../database/context-types';

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
    // 条件1: 对话轮次超过阈值
    if (context.conversationRounds.length > this.messagesToKeep * 2) {
      return true;
    }

    // 条件2: 任务状态为completed或failed时
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
    llmSummarize: (rounds: ConversationRound[]) => Promise<StructuredSummary>
  ): Promise<TaskContext> {
    // 1. 分离要压缩的轮次和要保留的轮次
    const roundsToCompress = context.conversationRounds.slice(0, -this.messagesToKeep);
    const roundsToKeep = context.conversationRounds.slice(-this.messagesToKeep);

    if (roundsToCompress.length === 0) {
      return context;
    }

    // 2. 生成新的结构化摘要
    const newSummary = await llmSummarize(roundsToCompress);

    // 3. 合并摘要
    const mergedSummary = this.mergeSummaries(context.summary, newSummary);

    // 4. 创建压缩后的上下文
    const compressedContext: TaskContext = {
      ...context,
      conversationRounds: roundsToKeep,
      summary: mergedSummary,
      metadata: {
        ...context.metadata,
        lastCompressedAt: new Date(),
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
   * 估算压缩后的token数
   */
  private estimateCompressedTokens(rounds: ConversationRound[], _summary: StructuredSummary): number {
    // 简单估算：每轮对话平均2000 tokens，摘要5000 tokens
    const roundTokens = rounds.length * 2000;
    const summaryTokens = 5000;

    return roundTokens + summaryTokens;
  }
}
