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
   * - Send heartbeat signals
   * - Report overall progress
   * - Monitor task health
   *
   * Default implementation does nothing to avoid infinite recursion
   * with observability plugin. Override to add custom progress monitoring.
   *
   * IMPORTANT: When implementing this method, avoid calling services.streams
   * directly as it may cause infinite recursion with the observability plugin.
   * Use services.logger.debug() instead for progress logging.
   *
   * @param context - Task execution context
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    // Default: no-op to prevent infinite recursion with observability plugin
    // Override in subclasses if needed, but avoid calling services.streams
  }
}
