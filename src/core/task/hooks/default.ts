import { BaseTaskHook } from './base.js';
import { TaskContext } from './types.js';

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
      id: entryId,
      type: 'task',
      status: 'started',
      task: task,
      timestamp: new Date().toISOString(),
      metadata: {},
      category: 'task_hook',
    });

    // 2. Log task start
    services.logger.info('Task started', { taskId, task });

    return undefined;
  }

  /**
   * Task post-execution hook.
   * 简化版：只发送最有价值的信息，避免对话历史等冗余数据
   *
   * 统一数据结构：
   * - type: 'task'
   * - stage: 'post'
   * - category: 'task_hook'
   */
  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, task, services } = context;
    const entryId = `${taskId}-default-post`;

    // 1. Determine final status
    const status = result.success ? 'completed' : 'failed';

    // 2. Get artifact count (from context.context.artifactIndex)
    const artifactCount = context.context?.artifactIndex?.length || 0;

    // 3. Get original task (without conversation history)
    // If originalTask is available, use it; otherwise fallback to context.task
    const taskToDisplay = (context as any).originalTask || context.task;

    // 5. Send simplified completion status to Stream
    await services.streams.taskExecution.set(taskId, entryId, {
      id: entryId,
      type: 'task',  // 统一为 'task'
      stage: 'post',  // 统一使用 stage 字段
      progressType: 'task-result',
      status,
      taskId,
      task: taskToDisplay,  // 使用原始任务，不包含对话历史
      timestamp: new Date().toISOString(),
      metadata: {
        data: {
          success: result.success,
          executionTime: result.executionTime,
          error: result.error,
        },
      },
      category: 'task_hook',
    });

    // 6. Log task completion (detailed info for internal use)
    services.logger.info('Task completed', {
      taskId,
      status,
      task,
      artifactCount,
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
    const { services } = context;
    try {
      services.logger.debug('Task progress', {
        taskId: context.taskId,
      });
    } catch (error: any) {
      // Ignore IPC channel closed errors during shutdown
      // This prevents unhandled error events when service is stopping
      if (error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
        console.warn('[DefaultTaskHook] Failed to log task progress:', error.message);
      }
    }
  }
}
