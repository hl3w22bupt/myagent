/**
 * Integration tests for MasterAgent RequestRewriter functionality.
 *
 * Tests: request rewriting flow with mocked dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MasterAgent } from '@/core/agent/master-agent';
import { setAgentStreams } from '@/core/agent/hooks/progress-notify';

describe('MasterAgent - RequestRewriter Integration', () => {
  let masterAgent: MasterAgent;
  let mockStreams: any;

  beforeEach(() => {
    // Mock streams BEFORE creating MasterAgent
    mockStreams = {
      taskExecution: {
        // @ts-expect-error - jest mockResolvedValue type issue
        set: jest.fn().mockResolvedValue(undefined),
      },
      executionTraces: {
        // @ts-expect-error - jest mockResolvedValue type issue
        set: jest.fn().mockResolvedValue(undefined),
      },
    };

    // Set global streams so MasterAgent can access them
    setAgentStreams(mockStreams);

    // Create MasterAgent with minimal config for testing
    masterAgent = new MasterAgent(
      {
        systemPrompt: 'You are a helpful assistant.',
        availableSkills: ['*'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          type: 'local',
          local: {
            pythonPath: process.env.PYTHON_PATH || 'python3',
            timeout: 30000,
          },
        },
        subagents: [],
      },
      'test-request-rewrite-session'
    );
  });

  afterEach(async () => {
    await masterAgent.cleanup();
  });

  describe('RequestRewriter Setup and Configuration', () => {
    it('should initialize requestRewriter and contextManager on construction', () => {
      // Verify internal instances are created
      expect((masterAgent as any).requestRewriter).toBeDefined();
      expect((masterAgent as any).contextManager).toBeDefined();
    });

    it('should call setTraceConfig before rewriteRequest in run()', async () => {
      const taskId = 'test-trace-config';
      const task = 'test task';

      // Spy on setTraceConfig method
      const setTraceConfigSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'setTraceConfig');

      await masterAgent.run(task, taskId);

      // Verify setTraceConfig was called with correct trace context
      expect(setTraceConfigSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          streams: expect.objectContaining({
            executionTraces: mockStreams.executionTraces,
          }),
          traceContext: expect.objectContaining({
            taskId: taskId,
          }),
        })
      );

      setTraceConfigSpy.mockRestore();
    });
  });

  describe('RequestRewriter Execution Flow', () => {
    it('should call rewriteRequest with conversation history', async () => {
      const taskId = 'test-task-history';
      const task = 'original task';

      // Spy on internal methods
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');
      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');

      // Mock context with conversation history
      getContextSpy.mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'previous message' },
          { role: 'assistant', content: 'previous response' },
        ],
        summary: {
          currentTask: task,
          completedSteps: [],
          filesModified: [],
        },
        artifactIndex: [],
      });

      // Mock rewrite to return modified task
      rewriteRequestSpy.mockResolvedValueOnce('rewritten task with context');

      const result = await masterAgent.run(task, taskId);

      // Verify rewrite was called
      expect(rewriteRequestSpy).toHaveBeenCalledWith(
        task,
        expect.any(Array),
        expect.objectContaining({
          maxHistoryMessages: 10,
          contextSummary: expect.objectContaining({
            currentTask: task,
            completedSteps: [],
            artifactIndex: [],
          }),
        })
      );

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });

    it('should handle empty conversation history', async () => {
      const taskId = 'test-empty-history';
      const task = 'simple task';

      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');

      // Mock empty context
      getContextSpy.mockResolvedValueOnce({
        messages: [],
        summary: null,
        artifactIndex: [],
      });

      // Mock rewrite returns same task
      rewriteRequestSpy.mockResolvedValueOnce(task);

      const result = await masterAgent.run(task, taskId);

      // Verify rewrite was still called
      expect(rewriteRequestSpy).toHaveBeenCalledWith(
        task,
        [],
        expect.any(Object)
      );

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });

    it('should handle rewrite failure gracefully', async () => {
      const taskId = 'test-rewrite-fail';
      const task = 'test task';

      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');

      // Mock rewrite failure
      rewriteRequestSpy.mockRejectedValueOnce(new Error('LLM service unavailable'));
      getContextSpy.mockResolvedValueOnce({
        messages: [],
        summary: null,
        artifactIndex: [],
      });

      const result = await masterAgent.run(task, taskId);

      // Verify result is returned even on failure
      expect(result).toBeDefined();

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });
  });

  describe('Context Summary Integration', () => {
    it('should pass context summary to rewriter', async () => {
      const taskId = 'test-context-summary';
      const task = 'continue previous work';

      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');

      const mockSummary = {
        currentTask: 'Previous task description',
        completedSteps: ['step1', 'step2'],
        filesModified: [
          { path: '/src/file1.ts' },
          { path: '/src/file2.ts' },
        ],
      };

      // Mock context with summary
      getContextSpy.mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'first message' },
          { role: 'assistant', content: 'first response' },
        ],
        summary: mockSummary,
        artifactIndex: mockSummary.filesModified,
      });

      await masterAgent.run(task, taskId);

      // Verify rewriter received context summary
      expect(rewriteRequestSpy).toHaveBeenCalledWith(
        task,
        expect.any(Array),
        expect.objectContaining({
          contextSummary: {
            currentTask: mockSummary.currentTask,
            completedSteps: mockSummary.completedSteps,
            artifactIndex: mockSummary.filesModified,
          },
        })
      );

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });

    it('should handle missing context summary', async () => {
      const taskId = 'test-no-summary';
      const task = 'new task';

      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');

      // Mock context without summary
      getContextSpy.mockResolvedValueOnce({
        messages: [],
        summary: null,
        artifactIndex: [],
      });

      await masterAgent.run(task, taskId);

      // Verify rewriter called with undefined contextSummary
      expect(rewriteRequestSpy).toHaveBeenCalledWith(
        task,
        [],
        expect.objectContaining({
          contextSummary: undefined,
        })
      );

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });
  });

  describe('Integration with Normal Flow', () => {
    it('should complete successfully with normal task', async () => {
      const taskId = 'test-normal-flow';
      const task = 'complete this task';

      const rewriteRequestSpy = jest.spyOn((masterAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((masterAgent as any).contextManager as any, 'getContext');

      // Mock normal context
      getContextSpy.mockResolvedValueOnce({
        messages: [],
        summary: null,
        artifactIndex: [],
      });
      rewriteRequestSpy.mockResolvedValueOnce(task);

      const result = await masterAgent.run(task, taskId);

      // Verify normal completion
      expect(result.success).toBe(true);
      expect(rewriteRequestSpy).toHaveBeenCalled();

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
    });

    it('should work with explicit delegation (bypass rewriting)', async () => {
      const taskId = 'test-delegation';
      const task = 'delegate this';
      const delegates = ['code-reviewer'];

      // Create new MasterAgent with explicit delegation
      const delegatingAgent = new MasterAgent(
        {
          systemPrompt: 'You are a helpful assistant.',
          availableSkills: ['*'],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
          sandbox: {
            type: 'local',
            local: {
              pythonPath: process.env.PYTHON_PATH || 'python3',
              timeout: 30000,
            },
          },
          subagents: ['code-reviewer'],
          delegateTo: delegates,
        },
        'test-delegation-session'
      );

      const rewriteRequestSpy = jest.spyOn((delegatingAgent as any).requestRewriter as any, 'rewriteRequest');
      const getContextSpy = jest.spyOn((delegatingAgent as any).contextManager as any, 'getContext');

      // Mock empty context
      getContextSpy.mockResolvedValueOnce({
        messages: [],
        summary: null,
        artifactIndex: [],
      });

      const result = await delegatingAgent.run(task, taskId);

      // With explicit delegation, flow should still complete
      expect(result).toBeDefined();

      getContextSpy.mockRestore();
      rewriteRequestSpy.mockRestore();
      await delegatingAgent.cleanup();
    });
  });
});
