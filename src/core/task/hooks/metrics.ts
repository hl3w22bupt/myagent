import { BaseTaskHook } from './base';
import { TaskContext } from './types';

/**
 * Metrics Collector TaskHook
 * Collects and reports task execution metrics
 *
 * NOTE: This is a simple placeholder implementation.
 * Full metrics integration depends on your monitoring system (Prometheus, DataDog, etc.)
 */
export class MetricsCollectorTaskHook extends BaseTaskHook {
  private startTime: number = 0;

  async preExec(_context: TaskContext): Promise<void> {
    // Record start time
    this.startTime = Date.now();
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const executionTime = Date.now() - this.startTime;

    const metrics = {
      taskId: context.taskId,
      executionTime,
      success: result.success,
    };

    // Log metrics (TODO: send to actual monitoring system)
    context.services.logger.info('Task metrics', metrics);
  }
}
