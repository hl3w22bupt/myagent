import { MetricsCollectorTaskHook } from '@/core/task/hooks/metrics';
import { TaskContext } from '@/core/task/hooks/types';

describe('MetricsCollectorTaskHook', () => {
  it('should collect and log metrics', async () => {
    const hook = new MetricsCollectorTaskHook();
    const mockContext: TaskContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      services: {
        streams: { taskExecution: { set: jest.fn() } },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        emit: jest.fn(),
      },
    };

    await hook.preExec(mockContext);
    await hook.postExec(mockContext, { success: true });

    expect(mockContext.services.logger.info).toHaveBeenCalledWith(
      'Task metrics',
      expect.objectContaining({
        taskId: 'test-1',
        success: true,
      })
    );
  });
});
