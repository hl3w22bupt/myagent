/**
 * Task Trace Hook.
 *
 * Captures detailed execution traces at the Task level.
 * Records input/output, errors, timing, and metadata for task execution.
 */

import { BaseTaskHook } from './base.js';
import { TaskContext } from './types.js';

/**
 * Task-level execution tracing hook.
 * Provides detailed tracking of task execution lifecycle.
 */
export class TaskTraceHook extends BaseTaskHook {
  /**
   * Called before task execution starts.
   * Records the initial task trace with input data.
   */
  async preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }> {
    const { taskId, task, services } = context;
    const id = `task-${taskId}-${Date.now()}`;

    try {
      // Create initial trace entry
      await services.streams.executionTraces.set(taskId, id, {
        id,
        traceId: id,
        level: 'task',
        taskId,
        stage: 'pre',
        status: 'started',
        retryCount: 0,
        maxRetries: 3,
        inputData: JSON.stringify({
          task,
          sessionId: context.context?.sessionId,
        }),
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId: context.context?.sessionId,
        },
      });

      services.logger.debug('[TaskTraceHook] Pre-execution trace recorded', { taskId, id });
    } catch (error) {
      // Don't fail the task if tracing fails
      services.logger.error('[TaskTraceHook] Failed to record pre-execution trace', { error, taskId });
    }

    return undefined;
  }

  /**
   * Called after task execution completes.
   * Records the final task trace with output and status.
   */
  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;
    const id = `task-${taskId}-${Date.now()}`;

    try {
      // Determine final status
      const status = result.success ? 'completed' : 'failed';

      // Create completion trace entry
      await services.streams.executionTraces.set(taskId, id, {
        id,
        traceId: id,
        level: 'task',
        taskId,
        stage: 'post',
        status,
        outputData: result.output ? JSON.stringify(result.output) : undefined,
        error: result.error,
        errorStack: result.errorStack,
        executionTime: result.executionTime,
        retryCount: 0,
        maxRetries: 3,
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId: context.context?.sessionId,
          data: {
            success: result.success,
          },
        },
      });

      services.logger.debug('[TaskTraceHook] Post-execution trace recorded', { taskId, id, status });
    } catch (error) {
      // Don't fail the task if tracing fails
      services.logger.error('[TaskTraceHook] Failed to record post-execution trace', { error, taskId });
    }
  }

  /**
   * Called periodically during task execution.
   * Records intermediate progress traces.
   *
   * NOTE: Disabled - processing traces don't provide meaningful information
   * beyond what's already captured in pre/post hooks.
   */
  async onProgressingNotify(_context: TaskContext): Promise<void> {
    // Processing traces disabled - they only contain metadata statistics
    // and don't add value beyond the pre/post hooks
    return;
    /*
    const { taskId, services, metadata } = context;
    const traceId = `task-${taskId}-progress-${Date.now()}`;

    try {
      // Record progress trace
      await services.streams.executionTraces.set(taskId, traceId, {
        traceId,
        level: 'task',
        taskId,
        stage: 'processing',
        status: 'running',
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId: context.context?.sessionId,
        },
      });

      services.logger.debug('[TaskTraceHook] Progress trace recorded', { taskId, traceId });
    } catch (error) {
      // Don't fail the task if tracing fails
      services.logger.error('[TaskTraceHook] Failed to record progress trace', { error, taskId });
    }
    */
  }
}
