import { UserAllowTaskHook } from '@/core/task/hooks/user-allow';
import { TaskContext } from '@/core/task/hooks/types';

describe('UserAllowTaskHook', () => {
  it('should allow task execution (placeholder)', async () => {
    const hook = new UserAllowTaskHook();
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

    const result = await hook.preExec(mockContext);

    expect(result).toBeUndefined();
  });
});
