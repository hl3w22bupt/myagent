import { BaseTaskHook } from '@/core/task/hooks/base';
import { TaskContext } from '@/core/task/hooks/types';

class TestTaskHook extends BaseTaskHook {
  async preExec(_context: TaskContext) {
    return undefined;
  }

  async postExec(_context: TaskContext, _result: any) {
    // Do nothing
  }
}

describe('BaseTaskHook', () => {
  it('should require preExec implementation', () => {
    // This test documents the abstract class requirement
    const hook = new TestTaskHook();
    expect(hook).toBeInstanceOf(BaseTaskHook);
  });

  it('should require postExec implementation', () => {
    // This test documents the abstract class requirement
    const hook = new TestTaskHook();
    expect(hook.postExec).toBeDefined();
  });

  it('should have default onProgressingNotify implementation (no-op)', async () => {
    const hook = new TestTaskHook();
    const mockContext: TaskContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'running',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
        },
        emit: jest.fn(),
      },
    };

    // Default implementation is a no-op - should not throw errors
    await expect(hook.onProgressingNotify(mockContext)).resolves.toBeUndefined();

    // Should not send any stream updates
    expect(mockContext.services.streams.taskExecution.set).not.toHaveBeenCalled();
  });
});
