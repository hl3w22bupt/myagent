import { ContextManagerTaskHook } from '../../../src/core/task/hooks/context-manager';
import { TaskContext } from '../../../src/core/task/hooks/base';

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

    it('should send initialization message to stream', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'step',
          currentStep: 'context_init',
          message: 'Context initialized (placeholder)',
        })
      );
    });

    it('should log initialization', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context initialized (placeholder)',
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
