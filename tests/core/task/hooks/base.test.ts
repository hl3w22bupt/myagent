import { BaseTaskHook } from '../../../src/core/task/hooks/base';
import { TaskContext } from '../../../src/core/task/hooks/types';

class TestTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return undefined;
  }

  async postExec(context: TaskContext, result: any) {
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

  it('should have default onProgressingNotify implementation', async () => {
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
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
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
        },
        emit: jest.fn(),
      },
    };

    await hook.onProgressingNotify(mockContext);

    expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
      'test-1',
      'test-1',
      expect.objectContaining({
        type: 'heartbeat',
        message: 'Task is still running...',
      })
    );
  });
});
