import { BaseTaskHook } from './base';
import { TaskContext, PreExecResult } from './types';

/**
 * Default TaskHook implementation
 * Provides:
 * - Send initial status to Stream on task start
 * - Send completion status to Stream on task end
 * - Send heartbeat every 30 seconds during execution
 * - Log task lifecycle events
 */
export class DefaultTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }> {
    const { taskId, task, services } = context;

    // 1. Send initial status to Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status: 'running',
      message: 'Task started',
      timestamp: new Date().toISOString(),
    });

    // 2. Log task start
    services.logger.info('Task started', { taskId, task });

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    // 1. Determine final status
    const status = result.success ? 'completed' : 'failed';

    // 2. Send completion status to Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status,
      message: result.success ? 'Task completed successfully' : 'Task failed',
      timestamp: new Date().toISOString(),
      data: result,
    });

    // 3. Log task completion
    services.logger.info('Task completed', {
      taskId,
      status,
      executionTime: result.executionTime,
    });
  }

  async onProgressingNotify(context: TaskContext): Promise<void> {
    // Log progress metrics only
    // Do NOT call services.streams to avoid infinite recursion with observability plugin
    const { services, metadata } = context;
    services.logger.debug('Task progress', {
      taskId: context.taskId,
      llmCalls: metadata.llmCalls,
      skillCalls: metadata.skillCalls,
      totalTokens: metadata.totalTokens,
    });
  }
}
