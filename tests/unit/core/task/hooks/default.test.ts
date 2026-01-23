import { DefaultTaskHook } from '@/core/task/hooks/default';
import { TaskContext } from '@/core/task/hooks/types';

describe('DefaultTaskHook', () => {
  let hook: DefaultTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    hook = new DefaultTaskHook();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 5,
        skillCalls: 3,
        totalTokens: 1000,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('preExec', () => {
    it('should send running status to stream', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'running',
          message: 'Task started',
        })
      );
    });

    it('should log task start', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task started',
        { taskId: 'test-1', task: 'test task' }
      );
    });

    it('should return undefined to continue execution', async () => {
      const result = await hook.preExec(mockContext);

      expect(result).toBeUndefined();
    });
  });

  describe('postExec', () => {
    it('should send completed status on success', async () => {
      const result = { success: true, executionTime: 5000 };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'completed',
          message: 'Task completed successfully',
          data: result,
        })
      );
    });

    it('should send failed status on failure', async () => {
      const result = { success: false, error: 'Test error' };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'failed',
          message: 'Task failed',
          data: result,
        })
      );
    });

    it('should log task completion with execution time', async () => {
      const result = { success: true, executionTime: 5000 };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task completed',
        { taskId: 'test-1', status: 'completed', executionTime: 5000 }
      );
    });
  });

  describe('onProgressingNotify', () => {
    it('should log progress metrics without calling streams', async () => {
      await hook.onProgressingNotify(mockContext);

      // Should log progress metrics
      expect(mockContext.services.logger.debug).toHaveBeenCalledWith(
        'Task progress',
        {
          taskId: 'test-1',
          llmCalls: 5,
          skillCalls: 3,
          totalTokens: 1000,
        }
      );

      // Should NOT call streams to avoid infinite recursion with observability plugin
      expect(mockContext.services.streams.taskExecution.set).not.toHaveBeenCalled();
    });
  });
});
