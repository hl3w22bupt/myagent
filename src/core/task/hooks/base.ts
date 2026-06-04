import { TaskContext } from './types.js';

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
   * Default implementation is a no-op (does nothing).
   *
   * Override this method to add custom progress monitoring:
   * - Send heartbeat signals to Stream
   * - Report overall progress
   * - Monitor task health
   * - Update external monitoring systems
   *
   * Example for custom heartbeat:
   * ```typescript
   * async onProgressingNotify(context: TaskContext) {
   *   const { taskId, services } = context;
   *   await services.streams.taskExecution.set(
   *     taskId,
   *     `${taskId}-heartbeat-${Date.now()}`,
   *     {
   *       type: 'heartbeat',
   *       status: 'running',
   *       timestamp: new Date().toISOString(),
   *     }
   *   );
   * }
   * ```
   *
   * @param context - Task execution context
   */
  async onProgressingNotify(_context: TaskContext): Promise<void> {
    // Default: no-op
    // Subclasses can override to implement custom progress tracking
  }
}
