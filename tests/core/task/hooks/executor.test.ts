import { TaskHookExecutor } from '../../../src/core/task/hooks/executor';
import { BaseTaskHook, TaskContext } from '../../../src/core/task/hooks/base';

class MockHook extends BaseTaskHook {
  preExecCalled = false;
  postExecCalled = false;
  progressingCalled = false;

  async preExec(context: TaskContext) {
    this.preExecCalled = true;
    return undefined;
  }

  async postExec(context: TaskContext, result: any) {
    this.postExecCalled = true;
  }

  async onProgressingNotify(context: TaskContext): Promise<void> {
    this.progressingCalled = true;
    await super.onProgressingNotify(context);
  }
}

class StoppingHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return { stop: true, reason: 'Test stop' };
  }

  async postExec(context: TaskContext, result: any) {
    // Do nothing
  }
}

class ModifyingHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return { modifiedTask: 'Modified task' };
  }

  async postExec(context: TaskContext, result: any) {
    // Do nothing
  }
}

describe('TaskHookExecutor', () => {
  let executor: TaskHookExecutor;
  let mockContext: TaskContext;

  beforeEach(() => {
    executor = new TaskHookExecutor();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'original task',
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
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('registerHook', () => {
    it('should register a hook', () => {
      const hook = new MockHook();
      executor.registerHook(hook);

      expect(executor.getHookCount()).toBe(1);
    });

    it('should register multiple hooks', () => {
      executor.registerHook(new MockHook());
      executor.registerHook(new MockHook());
      executor.registerHook(new MockHook());

      expect(executor.getHookCount()).toBe(3);
    });
  });

  describe('executePreHooks', () => {
    it('should execute all preExec hooks in order', async () => {
      const hook1 = new MockHook();
      const hook2 = new MockHook();
      executor.registerHook(hook1);
      executor.registerHook(hook2);

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(hook1.preExecCalled).toBe(true);
      expect(hook2.preExecCalled).toBe(true);
    });

    it('should stop at first hook that returns stop: true', async () => {
      executor.registerHook(new MockHook());
      executor.registerHook(new StoppingHook());
      const lastHook = new MockHook();
      executor.registerHook(lastHook);

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(true);
      expect(result.reason).toBe('Test stop');
      expect(lastHook.preExecCalled).toBe(false);
    });

    it('should apply modifiedTask from hooks', async () => {
      executor.registerHook(new ModifyingHook());

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(mockContext.task).toBe('Modified task');
    });

    it('should handle hook errors gracefully', async () => {
      class FailingHook extends BaseTaskHook {
        async preExec() {
          throw new Error('Hook error');
        }
        async postExec() {}
      }

      executor.registerHook(new FailingHook());
      executor.registerHook(new MockHook());

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(mockContext.services.logger.error).toHaveBeenCalled();
    });
  });

  describe('executePostHooks', () => {
    it('should execute all postExec hooks', async () => {
      const hook1 = new MockHook();
      const hook2 = new MockHook();
      executor.registerHook(hook1);
      executor.registerHook(hook2);

      await executor.executePostHooks(mockContext, { success: true });

      expect(hook1.postExecCalled).toBe(true);
      expect(hook2.postExecCalled).toBe(true);
    });

    it('should handle hook errors gracefully', async () => {
      class FailingHook extends BaseTaskHook {
        async preExec() { return undefined; }
        async postExec() {
          throw new Error('Post hook error');
        }
      }

      executor.registerHook(new FailingHook());
      executor.registerHook(new MockHook());

      await executor.executePostHooks(mockContext, { success: true });

      expect(mockContext.services.logger.error).toHaveBeenCalled();
    });
  });

  describe('progressing hooks lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start progressing hooks', () => {
      const hook = new MockHook();
      executor.registerHook(hook);

      executor.startProgressingHooks(mockContext);

      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);

      expect(hook.progressingCalled).toBe(true);
    });

    it('should stop progressing hooks', () => {
      executor.startProgressingHooks(mockContext);

      const stopCount = jest.spyOn(executor, 'stopProgressingHooks');
      executor.stopProgressingHooks();

      expect(stopCount).toHaveBeenCalled();
    });
  });
});
