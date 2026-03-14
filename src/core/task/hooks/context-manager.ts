import { BaseTaskHook } from './base';
import { TaskContext } from './types';
import { ContextManager } from '../../context/manager';
import { LLMSummarizer } from '../../llm/summarizer';
import { getDataStore } from '../../database/data-store';
import { ConversationHistoryEntry } from '../../database/context-types';

/**
 * Context Manager TaskHook
 * 管理任务上下文生命周期（创建、保存、压缩）
 */
export class ContextManagerTaskHook extends BaseTaskHook {
  private contextManager: ContextManager;

  constructor(contextManager?: ContextManager) {
    super();

    if (contextManager) {
      this.contextManager = contextManager;
    } else {
      // 创建默认的ContextManager，配置LLM摘要器
      const apiKey = process.env.LLM_API_KEY || '';
      const summarizer = apiKey ? new LLMSummarizer({ apiKey }) : undefined;
      this.contextManager = new ContextManager(getDataStore(), summarizer);
    }
  }

  async preExec(
    context: TaskContext
  ): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }> {
    const { taskId, sessionId, task, services } = context;

    try {
      // 创建任务上下文
      const taskContext = await this.contextManager.createTaskContext(
        taskId,
        sessionId,
        task
      );

      // 将上下文附加到TaskContext
      context.context = taskContext;

      // ⭐ 新增：构建对话历史供 Agent 使用
      const history = this.buildConversationHistory(taskContext.conversationRounds);
      (context as any).conversationHistory = history;

      services.logger.info('Task context created', {
        taskId,
        sessionId,
        roundsCount: taskContext.conversationRounds.length,
        conversationHistoryLength: history.length,
      });

      return undefined;
    } catch (error) {
      services.logger.error('Failed to create task context', {
        taskId,
        error: (error as Error).message,
      });

      // 如果上下文创建失败，可以选择停止任务或继续
      // 这里选择继续，但创建一个空上下文
      context.context = {
        taskId,
        sessionId,
        conversationRounds: [],
        summary: {
          sessionIntent: '',
          currentTask: task,
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'pending',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        skillExecutionHistory: [],
        toolUsageHistory: [],
        workingMemory: {},
        metadata: {},
      };

      return undefined;
    }
  }

  /**
   * 构建对话历史供 Agent 使用
   * 将 conversationRounds 转换为 Agent 需要的格式
   */
  private buildConversationHistory(rounds: any[]): ConversationHistoryEntry[] {
    if (!rounds || rounds.length === 0) {
      return [];
    }

    return rounds.flatMap((round: any) => {
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

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    try {
      // ⭐ 新增：保存对话轮次
      // 从数据库重新加载最新的 context，以获取正确的 round 号
      const latestContext = await this.contextManager.getContext(taskId);
      const currentRound = (latestContext?.conversationRounds?.length || 0) + 1;

      // 从 result.structuredOutputs 获取 artifacts（只记录类型）
      const artifacts = (result.structuredOutputs || [])
        .map((so: any) => ({
          type: so.result_type,
        }))
        .filter(Boolean);

      const newRound = {
        round: currentRound,
        timestamp: new Date(),
        userMessage: context.task,
        assistantOutput: result.success ? result.output : undefined,
        error: result.success ? undefined : result.error,
        artifacts,
      };

      // addConversationRound 返回更新后的上下文
      const updatedContext = await this.contextManager.addConversationRound(taskId, newRound);

      services.logger.info('Conversation round saved', {
        taskId,
        round: currentRound,
        hasArtifact: artifacts.length > 0,
      });

      // 更新上下文的最终状态 - 使用从数据库返回的最新上下文
      if (updatedContext) {
        // 更新状态
        updatedContext.summary.currentStatus = context.status;

        // 如果任务成功，添加到已完成步骤
        if (result.success && updatedContext.summary.completedSteps) {
          updatedContext.summary.completedSteps.push(context.task);
        }

        // ⭐ 注意：我们不再同步 conversationHistory 到 messages 表
        // 直接使用 conversationRounds 作为唯一数据源

        // 保存上下文
        await this.contextManager.saveContext(updatedContext);

        services.logger.info('Task context saved', {
          taskId,
          roundsCount: updatedContext.conversationRounds.length,
          hasCompression: !!updatedContext.metadata.lastCompressedAt,
          currentStatus: updatedContext.summary.currentStatus,
        });
      } else {
        services.logger.warn('Failed to get updated context after addConversationRound', { taskId });
      }
    } catch (error) {
      services.logger.error('Failed to save task context', {
        taskId,
        error: (error as Error).message,
      });
    }
  }
}
