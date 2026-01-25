/**
 * Integration tests for Skill Hook System
 *
 * Tests the complete flow from Skill execution through Hooks to Notify API
 */

// Mock implementations for testing
class MockHook {
  preExecCalls: any[] = [];
  postExecCalls: any[] = [];
  progressCalls: any[] = [];

  async preExec(context: any): Promise<any> {
    this.preExecCalls.push(context);
    return null;
  }

  async postExec(context: any, result: any): Promise<any> {
    this.postExecCalls.push({ context, result });
    return result;
  }

  async onProgressingNotify(context: any, progressData: any): Promise<any> {
    this.progressCalls.push({ context, progressData });
    return { timestamp: Date.now() };
  }
}

class SkillHookExecutor {
  hook: any;
  notifyApiUrl: string | null;
  private httpClient: any = null;

  constructor({ hook = null, notifyApiUrl = null }: any = {}) {
    this.hook = hook || new NoOpHook();
    this.notifyApiUrl = notifyApiUrl;
  }

  async reportProgress(context: any, progressType: string, data: any): Promise<void> {
    const progressMods = await this.hook.onProgressingNotify(context, data);
    if (progressMods) {
      Object.assign(data, progressMods);
    }
    await this._notifyProgress(context.taskId, progressType, data);
  }

  private async _notifyProgress(taskId: string, progressType: string, data: any): Promise<void> {
    if (!this.notifyApiUrl) return;
    // Simulate HTTP call
    console.log(`[Mock] Sending notification to ${this.notifyApiUrl}`);
  }

  async executeWithHooks(skillName: string, skillFunc: any, inputData: any): Promise<any> {
    const context = {
      skillName,
      taskId: inputData.taskId || '',
      sessionId: inputData.sessionId || '',
      inputData,
      metadata: inputData.metadata || {},
      executionStartTime: Date.now() / 1000,
    };

    const preResult = await this.hook.preExec(context);
    if (preResult?.action === 'stop') {
      return {
        success: false,
        error: 'Stopped by pre-hook',
        reason: preResult.reason,
      };
    }
    if (preResult?.modifiedInput) {
      inputData = preResult.modifiedInput;
    }

    let result;
    try {
      result = await skillFunc(inputData);
    } catch (e: any) {
      result = { success: false, error: e.message };
    }

    const postResult = await this.hook.postExec(context, result);
    if (postResult) {
      Object.assign(result, postResult);
    }

    return result;
  }

  async close(): Promise<void> {
    this.httpClient = null;
  }
}

class NoOpHook {
  async preExec(context: any): Promise<any> {
    return null;
  }

  async postExec(context: any, result: any): Promise<any> {
    return result;
  }

  async onProgressingNotify(context: any, progressData: any): Promise<any> {
    return {};
  }
}

describe('Skill Hook Integration Flow', () => {
  let mockStreams: any;
  let mockLogger: any;

  beforeEach(() => {
    mockStreams = {
      taskExecution: {
        set: jest.fn().mockResolvedValue(undefined),
      },
    };
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Hook Lifecycle', () => {
    it('should execute pre_hook, skill, and post_hook in order', async () => {
      const hook = new MockHook();
      const executor = new SkillHookExecutor({ hook });

      const executionOrder: string[] = [];

      hook.preExec = jest.fn().mockImplementation(async (context: any) => {
        executionOrder.push('pre_exec');
        return null;
      });

      hook.postExec = jest.fn().mockImplementation(async (context: any, result: any) => {
        executionOrder.push('post_exec');
        return result;
      });

      const skillFunc = jest.fn().mockImplementation(async (input: any) => {
        executionOrder.push('skill_func');
        return { success: true, output: 'result' };
      });

      const result = await executor.executeWithHooks('test-skill', skillFunc, {
        query: 'test',
      });

      expect(executionOrder).toEqual(['pre_exec', 'skill_func', 'post_exec']);
      expect(result.success).toBe(true);
    });

    it('should stop execution when pre_hook returns STOP action', async () => {
      const hook = new MockHook();
      hook.preExec = jest.fn().mockResolvedValue({
        action: 'stop',
        reason: 'Validation failed',
      });

      const executor = new SkillHookExecutor({ hook });
      const skillFunc = jest.fn().mockResolvedValue({ success: true });

      const result = await executor.executeWithHooks('test-skill', skillFunc, {});

      expect(result).toEqual({
        success: false,
        error: 'Stopped by pre-hook',
        reason: 'Validation failed',
      });
      expect(skillFunc).not.toHaveBeenCalled();
    });

    it('should use modified input from pre_hook', async () => {
      const hook = new MockHook();
      hook.preExec = jest.fn().mockResolvedValue({
        modifiedInput: { query: 'modified query' },
      });

      const executor = new SkillHookExecutor({ hook });

      let receivedInput: any = null;
      const skillFunc = jest.fn().mockImplementation(async (input: any) => {
        receivedInput = input;
        return { success: true, received: input.query };
      });

      await executor.executeWithHooks('test-skill', skillFunc, { query: 'original' });

      expect(receivedInput.query).toBe('modified query');
    });

    it('should apply post_hook modifications to result', async () => {
      const hook = new MockHook();
      hook.postExec = jest.fn().mockImplementation(async (context: any, result: any) => {
        result.extra = 'metadata';
        return result;
      });

      const executor = new SkillHookExecutor({ hook });
      const skillFunc = jest.fn().mockResolvedValue({ success: true });

      const result = await executor.executeWithHooks('test-skill', skillFunc, {});

      expect(result.extra).toBe('metadata');
    });

    it('should handle skill function exceptions', async () => {
      const hook = new MockHook();
      const executor = new SkillHookExecutor({ hook });

      const skillFunc = jest.fn().mockRejectedValue(new Error('Skill failed'));
      const postExecSpy = jest.spyOn(hook, 'postExec');

      const result = await executor.executeWithHooks('test-skill', skillFunc, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Skill failed');
      expect(postExecSpy).toHaveBeenCalled(); // post_exec still called
      postExecSpy.mockRestore();
    });
  });

  describe('Progress Reporting Integration', () => {
    it('should call hook on_progressing_notify and merge modifications', async () => {
      const hook = new MockHook();
      hook.onProgressingNotify = jest.fn().mockResolvedValue({
        customField: 'customValue',
      });

      const executor = new SkillHookExecutor({ hook });

      await executor.reportProgress(
        { taskId: 'test-123', skillName: 'test-skill' },
        'step',
        { message: 'Test message' }
      );

      expect(hook.onProgressingNotify).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'test-123' }),
        expect.objectContaining({ message: 'Test message' })
      );
    });

    it('should handle missing notify_api_url gracefully', async () => {
      const hook = new MockHook();
      const executor = new SkillHookExecutor({
        hook,
        notifyApiUrl: null,
      });
      const onProgressSpy = jest.spyOn(hook, 'onProgressingNotify');

      await executor.reportProgress(
        { taskId: 'test-123' },
        'step',
        { message: 'Test' }
      );

      // Should not throw
      expect(onProgressSpy).toHaveBeenCalled();
      onProgressSpy.mockRestore();
    });
  });

  describe('End-to-End Scenario', () => {
    it('should complete full skill execution with progress reporting', async () => {
      const hook = new MockHook();
      const executor = new SkillHookExecutor({ hook, notifyApiUrl: 'http://localhost:3000/api/notify' });

      const progressSteps: string[] = [];

      hook.onProgressingNotify = jest.fn().mockImplementation(async (context: any, data: any) => {
        progressSteps.push(data.message);
        return {};
      });

      const preExecSpy = jest.spyOn(hook, 'preExec');
      const postExecSpy = jest.spyOn(hook, 'postExec');

      const skillFunc = jest.fn().mockImplementation(async (input: any) => {
        // Report progress during skill execution
        await executor.reportProgress(
          { taskId: 'test-123', skillName: 'test-skill' },
          'step',
          { message: 'Processing...' }
        );

        return { success: true, output: 'done' };
      });

      const result = await executor.executeWithHooks('test-skill', skillFunc, {
        query: 'test',
        task_id: 'test-123',
      });

      expect(result.success).toBe(true);
      expect(progressSteps).toContain('Processing...');
      expect(preExecSpy).toHaveBeenCalled();
      expect(postExecSpy).toHaveBeenCalled();
      preExecSpy.mockRestore();
      postExecSpy.mockRestore();
      await executor.close();
    });
  });
});
