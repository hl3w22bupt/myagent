import { TaskContext, PreExecResult } from './types';

/**
 * Abstract base class for all TaskHooks
 * All TaskHooks must extend this class and implement preExec and postExec
 */
export abstract class BaseTaskHook {
  /**
   * Called before task execution starts
   *
   * Use for:
   * - Task initialization
   * - Permission validation
   * - Task configuration
   * - Sending initial status to frontend
   *
   * @param context - Task execution context
   * @returns undefined to continue, {stop: true, reason: '...'} to abort, or {modifiedTask: '...'} to change task
   */
  abstract preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }>;

  /**
   * Called after task execution completes (success or failure)
   *
   * Use for:
   * - Cleanup resources
   * - Record execution statistics
   * - Send completion notifications
   * - Update task status in database
   *
   * @param context - Task execution context
   * @param result - Task execution result
   */
  abstract postExec(context: TaskContext, result: any): Promise<void>;

  /**
   * Called periodically during task execution (every 30s by default)
   *
   * Use for:
   * - Send heartbeat signals to Stream
   * - Report overall progress
   * - Monitor task health
   *
   * Default implementation sends heartbeat to Stream.
   * Override to add custom progress monitoring.
   *
   * Note: Observability plugin is disabled in motia.config.ts to prevent
   * infinite recursion. With observability disabled, Stream operations are safe.
   *
   * @param context - Task execution context
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    const { taskId, services } = context;

    // Default: send heartbeat to Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'heartbeat',
      message: 'Task is still running...',
      timestamp: new Date().toISOString(),
    });
  }
}
