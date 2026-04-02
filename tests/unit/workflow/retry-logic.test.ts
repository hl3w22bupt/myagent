/**
 * Workflow Retry Logic Tests
 *
 * Tests retry behavior for workflow steps including:
 * - Automatic retries on retryable errors
 * - Exponential backoff
 * - Retry exhaustion
 * - Custom retryable checkers
 */

import { WorkflowEngine } from '../../../src/core/workflow/engine';
import { AgentManager } from '../../../src/core/agent/manager';
import { WorkflowConfig, WorkflowStep } from '../../../src/core/workflow/types';
import { getDataStore } from '../../../src/core/database/data-store';

describe('Workflow Retry Logic', () => {
  let workflowEngine: WorkflowEngine;
  let agentManager: AgentManager;

  beforeAll(async () => {
    const store = getDataStore();
    await store.initialize();

    const config = {
      systemPrompt: 'Test agent',
      availableSkills: [],
      llm: {
        provider: 'test',
        model: 'test-model',
      },
    };
    agentManager = new AgentManager({
      sessionTimeout: 30000,
      maxSessions: 10,
      agentConfig: config,
    });
    workflowEngine = new WorkflowEngine(agentManager, console);
  });

  afterAll(async () => {
    const store = getDataStore();
    await store.close();
  });

  describe('Automatic Retries', () => {
    it('should retry on network error and succeed', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-retry-success',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 2,
              delayMs: 100,
              exponentialBackoff: false,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-retry-success', workflowConfig);

      // Mock agent that fails once then succeeds
      const mockAgent = {
        run: jest.fn()
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
          .mockResolvedValueOnce({ output: 'Success after retry' }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-retry-success',
        {},
        { taskId: 'retry-success-test' }
      );

      expect(result.success).toBe(true);
      expect(mockAgent.run).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry
    });

    it('should exhaust retries and fail', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-retry-exhausted',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 2,
              delayMs: 50,
              exponentialBackoff: false,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-retry-exhausted', workflowConfig);

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-retry-exhausted',
        {},
        { taskId: 'retry-exhausted-test' }
      );

      expect(result.success).toBe(false);
      expect(mockAgent.run).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.error).toContain('after retries');
    });

    it('should not retry on non-retryable errors', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-no-retry-syntax',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 3,
              delayMs: 50,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-no-retry-syntax', workflowConfig);

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('SyntaxError: Unexpected token')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-no-retry-syntax',
        {},
        { taskId: 'no-retry-syntax-test' }
      );

      expect(result.success).toBe(false);
      expect(mockAgent.run).toHaveBeenCalledTimes(1); // No retries for syntax errors
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff between retries', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-exponential-backoff',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 3,
              delayMs: 100,
              exponentialBackoff: true,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-exponential-backoff', workflowConfig);

      const timestamps: number[] = [];
      const mockAgent = {
        run: jest.fn().mockImplementation(async () => {
          timestamps.push(Date.now());
          throw new Error('ECONNRESET');
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const startTime = Date.now();
      await workflowEngine.execute(
        'test-exponential-backoff',
        {},
        { taskId: 'exponential-backoff-test' }
      );

      // Verify delays increase exponentially (100ms, 200ms, 400ms)
      expect(timestamps.length).toBe(4); // Initial + 3 retries

      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      const delay3 = timestamps[3] - timestamps[2];

      // Each delay should be approximately double the previous
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
      expect(delay3).toBeGreaterThan(delay2 * 1.5);
    });
  });

  describe('Custom Retryable Checker', () => {
    it('should use custom isRetryable function', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-custom-retryable',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 2,
              delayMs: 50,
              isRetryable: (error: Error) => {
                // Only retry if error message contains 'TEMP'
                return error.message.includes('TEMP');
              },
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-custom-retryable', workflowConfig);

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('TEMPORARY_FAILURE')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-custom-retryable',
        {},
        { taskId: 'custom-retryable-test' }
      );

      expect(result.success).toBe(false);
      expect(mockAgent.run).toHaveBeenCalledTimes(3); // Should retry TEMP errors
    });

    it('should not retry when custom checker returns false', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-custom-no-retry',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 5,
              delayMs: 50,
              isRetryable: (error: Error) => {
                return error.message.includes('TEMP');
              },
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-custom-no-retry', workflowConfig);

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('PERMANENT_FAILURE')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-custom-no-retry',
        {},
        { taskId: 'custom-no-retry-test' }
      );

      expect(result.success).toBe(false);
      expect(mockAgent.run).toHaveBeenCalledTimes(1); // Should not retry PERMANENT errors
    });
  });

  describe('Retry with Jitter', () => {
    it('should add jitter to retry delays', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-retry-jitter',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 3,
              delayMs: 100,
              exponentialBackoff: false,
              jitterFactor: 0.2,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-retry-jitter', workflowConfig);

      const timestamps: number[] = [];
      const mockAgent = {
        run: jest.fn().mockImplementation(async () => {
          timestamps.push(Date.now());
          throw new Error('ECONNRESET');
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      await workflowEngine.execute(
        'test-retry-jitter',
        {},
        { taskId: 'retry-jitter-test' }
      );

      expect(timestamps.length).toBe(4);

      // With jitterFactor 0.2 and delayMs 100:
      // Each delay should be between 80ms and 120ms
      const delays = timestamps.slice(1).map((t, i) => t - timestamps[i]);

      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(80);
        expect(delay).toBeLessThanOrEqual(120);
      }
    });
  });

  describe('Retry with Max Delay', () => {
    it('should cap retry delays at maxDelayMs', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-max-delay',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            retry: {
              maxRetries: 5,
              delayMs: 1000,
              maxDelayMs: 2000,
              exponentialBackoff: true,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-max-delay', workflowConfig);

      const timestamps: number[] = [];
      const mockAgent = {
        run: jest.fn().mockImplementation(async () => {
          timestamps.push(Date.now());
          throw new Error('ECONNRESET');
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      await workflowEngine.execute(
        'test-max-delay',
        {},
        { taskId: 'max-delay-test' }
      );

      expect(timestamps.length).toBe(6); // Initial + 5 retries

      // Check that no delay exceeds maxDelayMs (with some tolerance)
      const delays = timestamps.slice(1).map((t, i) => t - timestamps[i]);
      const maxDelay = Math.max(...delays);

      expect(maxDelay).toBeLessThan(2500); // Allow 500ms tolerance
    });
  });
});
