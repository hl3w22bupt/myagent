import { ContextManagerTaskHook } from '@/core/task/hooks/context-manager';
import { TaskContext } from '@/core/task/hooks/types';

describe('ContextManagerTaskHook', () => {
  let hook: ContextManagerTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    hook = new ContextManagerTaskHook();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending',
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
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('preExec', () => {
    it('should initialize empty context object', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.context).toEqual({
        messages: [],
        summary: null,
        artifactIndex: [],
      });
    });

    it('should log placeholder message at debug level', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.logger.debug).toHaveBeenCalledWith(
        'Task context placeholder',
        { taskId: 'test-1' }
      );
    });
  });

  describe('postExec', () => {
    it('should log context save', async () => {
      mockContext.context = { test: 'data' };

      await hook.postExec(mockContext, { success: true });

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context saved (placeholder)',
        { taskId: 'test-1', hasContext: true }
      );
    });
  });
});
