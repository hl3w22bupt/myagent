import { BaseTaskHook } from './base.js';
import { TaskContext } from './types.js';

/**
 * Manages and executes TaskHooks
 * - Registers hooks
 * - Executes preExec hooks in order
 * - Executes postExec hooks in order
 * - Manages progressing hooks lifecycle (start/stop)
 */
export class TaskHookExecutor {
  private hooks: BaseTaskHook[] = [];
  private progressingInterval: NodeJS.Timeout | null = null;

  /**
   * Register a TaskHook
   * @param hook - TaskHook instance to register
   */
  registerHook(hook: BaseTaskHook): void {
    this.hooks.push(hook);
  }

  /**
   * Execute all preExec hooks in registration order
   * Stops at first hook that returns {stop: true}
   * Applies modifiedTask from hooks
   *
   * @param context - Task execution context
   * @returns {stop: boolean, reason?: string, modifiedTask?: string}
   */
  async executePreHooks(context: TaskContext): Promise<{ stop: boolean; reason?: string; modifiedTask?: string }> {
    for (const hook of this.hooks) {
      try {
        const result = await hook.preExec(context);

        if (result && result.stop) {
          return {
            stop: true,
            reason: result.reason || 'Stopped by task hook',
          };
        }

        if (result && result.modifiedTask) {
          context.task = result.modifiedTask;
        }
      } catch (error) {
        // Log error but continue with next hook
        context.services.logger.error('TaskHook preExec failed', {
          error,
          hookName: hook.constructor.name,
          taskId: context.taskId,
        });
      }
    }

    return { stop: false };
  }

  /**
   * Execute all postExec hooks in registration order
   * Continues even if individual hooks fail
   *
   * @param context - Task execution context
   * @param result - Task execution result
   */
  async executePostHooks(context: TaskContext, result: any): Promise<void> {
    for (const hook of this.hooks) {
      try {
        await hook.postExec(context, result);
      } catch (error) {
        // Log error but continue with next hook
        context.services.logger.error('TaskHook postExec failed', {
          error,
          hookName: hook.constructor.name,
          taskId: context.taskId,
        });
      }
    }
  }

  /**
   * Start progressing hooks (background execution)
   * Calls onProgressingNotify() every 30 seconds
   *
   * @param context - Task execution context
   */
  startProgressingHooks(context: TaskContext): void {
    this.progressingInterval = setInterval(async () => {
      for (const hook of this.hooks) {
        try {
          await hook.onProgressingNotify(context);
        } catch (error) {
          // Silent failure, don't interrupt task
          // ⭐ Also handle IPC channel closed errors gracefully
          const err = error as { code?: string; message?: string };
          if (err.code === 'ERR_IPC_CHANNEL_CLOSED') {
            // IPC channel closed, likely during shutdown - ignore silently
            console.debug(`[TaskHookExecutor] IPC channel closed for ${hook.constructor.name}, skipping progress notification`);
          } else {
            // For other errors, try to log but don't throw
            try {
              context.services.logger.warn('TaskHook progressing failed', {
                error: err.message || String(error),
                hookName: hook.constructor.name,
                taskId: context.taskId,
              });
            } catch (logError) {
              // If logging also fails (e.g., IPC closed), use console
              const logErr = logError as { message?: string };
              console.warn('[TaskHookExecutor] Failed to log progressing error:', logErr.message || String(logError));
            }
          }
        }
      }
    }, 30000); // 30 second interval
  }

  /**
   * Stop progressing hooks
   * Clears the interval timer
   */
  stopProgressingHooks(): void {
    if (this.progressingInterval) {
      clearInterval(this.progressingInterval);
      this.progressingInterval = null;
    }
  }

  /**
   * Get registered hooks count
   */
  getHookCount(): number {
    return this.hooks.length;
  }
}
