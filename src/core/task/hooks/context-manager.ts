import { BaseTaskHook } from './base';
import { TaskContext } from './types';
import { ContextManager } from '../../context/manager';
import { LLMSummarizer } from '../../llm/summarizer';
import { getDataStore } from '../../database/data-store';

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

      services.logger.info('Task context created', {
        taskId,
        sessionId,
        currentTurn: taskContext.currentTurn,
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
        currentTurn: 0,
        messages: [],
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
        workingMemory: {},
        metadata: {
          totalTokens: 0,
          llmCallsCount: 0,
          skillCallsCount: 0,
        },
      };

      return undefined;
    }
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    try {
      // 更新上下文的最终状态
      if (context.context) {
        context.context.summary.currentStatus = context.status;

        // 如果任务成功，添加到已完成步骤
        if (result.success && context.context.summary.completedSteps) {
          context.context.summary.completedSteps.push(context.task);
        }

        // 保存上下文
        await this.contextManager.saveContext(context.context);

        services.logger.info('Task context saved', {
          taskId,
          currentTurn: context.context.currentTurn,
          totalTokens: context.context.metadata.totalTokens,
          hasCompression: !!context.context.metadata.lastCompressedAt,
        });
      }
    } catch (error) {
      services.logger.error('Failed to save task context', {
        taskId,
        error: (error as Error).message,
      });
    }
  }
}
