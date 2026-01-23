import { BaseTaskHook } from './base';
import { TaskContext, PreExecResult } from './types';

/**
 * Default TaskHook implementation
 * Provides:
 * - Send initial status to Stream on task start
 * - Send completion status to Stream on task end
 * - Log task lifecycle events
 *
 * Note: onProgressingNotify is intentionally a no-op (empty operation)
 * to avoid excessive Stream updates. Heartbeat is handled by other
 * components if needed.
 */
export class DefaultTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }> {
    const { taskId, task, services } = context;
    const entryId = `${taskId}-default-pre`;

    // 1. Send initial status to Stream
    await services.streams.taskExecution.set(taskId, entryId, {
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
    const entryId = `${taskId}-default-post`;

    // 1. Determine final status
    const status = result.success ? 'completed' : 'failed';

    // 2. Send completion status to Stream
    await services.streams.taskExecution.set(taskId, entryId, {
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

  /**
   * onProgressingNotify - Intentionally a no-op
   *
   * DefaultTaskHook does not send periodic heartbeat updates to Stream.
   * This avoids excessive Stream writes and keeps the output clean.
   *
   * If you need heartbeat functionality:
   * - Create a custom Hook that overrides onProgressingNotify
   * - Or use a separate monitoring service
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    // No-op: Do not send heartbeat to Stream
    // This keeps Stream output minimal and focused on actual state changes
 
    // Add custom progress metrics logging
    const { services, metadata } = context;
    services.logger.debug('Task progress', {
      taskId: context.taskId,
      llmCalls: metadata.llmCalls,
      skillCalls: metadata.skillCalls,
      totalTokens: metadata.totalTokens,
    });
  }
}
