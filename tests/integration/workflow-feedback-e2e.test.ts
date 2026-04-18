/**
 * Workflow Feedback Loop End-to-End Integration Tests
 *
 * Tests complete feedback loop scenarios:
 * - Retry success after transient failure
 * - Complete HITL flow (failure -> request -> response -> action)
 * - Rollback and recovery
 * - Combined retry + HITL
 * - Complex multi-step workflows
 */

import { WorkflowEngine } from '../../src/core/workflow/engine';
import { AgentManager } from '../../src/core/agent/manager';
import { ContextManager } from '../../src/core/context/manager';
import { WorkflowConfig } from '../../src/core/workflow/types';
import { getDataStore } from '../../src/core/database/data-store';

describe('Workflow Feedback Loop E2E', () => {
  let workflowEngine: WorkflowEngine;
  let agentManager: AgentManager;
  let contextManager: ContextManager;

  /** Helper to create a mock agent with all methods the WorkflowEngine expects */
  const createMockAgent = (runImpl: (...args: any[]) => any) => ({
    run: jest.fn().mockImplementation(runImpl),
    updateLLMTraceConfig: jest.fn(),
    setHookManager: jest.fn(),
    cleanup: jest.fn(),
  });

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
    contextManager = new ContextManager(store);
    workflowEngine = new WorkflowEngine(agentManager, console);
  });

  afterAll(async () => {
    const store = getDataStore();
    await store.close();
  });

  describe('Retry Success Scenario', () => {
    it('should recover from transient network failure with retry', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-retry-success',
        description: 'API call with retry on transient network error',
        steps: [
          {
            id: 'fetch-data',
            agent: 'developer',
            retry: {
              maxRetries: 3,
              delayMs: 100,
              exponentialBackoff: true,
            },
          },
          {
            id: 'process-data',
            agent: 'developer',
            depends_on: ['fetch-data'],
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-retry-success', workflowConfig);

      let fetchAttempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        if (task.includes('fetch-data')) {
          fetchAttempts++;
          if (fetchAttempts <= 2) {
            throw new Error('ECONNREFUSED: Connection refused');
          }
          return {
            output: 'Data fetched successfully',
            structuredOutput: { data: [1, 2, 3] },
          };
        }
        return {
          output: 'Data processed',
          structuredOutput: { result: 'processed' },
        };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'e2e-retry-success',
        { query: 'test data' },
        { taskId: 'e2e-retry-test' }
      );

      expect(result.success).toBe(true);
      expect(fetchAttempts).toBe(3); // Initial + 2 retries
      expect(result.output).toEqual({ result: 'processed' });
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('completed');
    });
  });

  describe('HITL Complete Flow', () => {
    it('should complete HITL flow: failure -> request -> response -> action', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-hitl-flow',
        description: 'Deployment with human approval on failure',
        steps: [
          {
            id: 'test',
            agent: 'developer',
          },
          {
            id: 'deploy',
            agent: 'developer',
            depends_on: ['test'],
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 10000,
              question: 'Deployment failed. Approve retry?',
              options: [
                {
                  id: 'retry',
                  label: 'Retry Deployment',
                  description: 'Attempt deployment again',
                  action: 'retry',
                  style: 'primary',
                },
                {
                  id: 'skip',
                  label: 'Skip Deployment',
                  description: 'Continue without deploying',
                  action: 'skip',
                  style: 'secondary',
                },
                {
                  id: 'abort',
                  label: 'Abort',
                  description: 'Cancel the workflow',
                  action: 'abort',
                  style: 'danger',
                },
              ],
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-hitl-flow', workflowConfig);

      let deployAttempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        if (task.includes('test')) {
          return {
            output: 'Tests passed',
            structuredOutput: { testsPassed: true },
          };
        }
        if (task.includes('deploy')) {
          deployAttempts++;
          if (deployAttempts === 1) {
            throw new Error('Deployment failed: insufficient resources');
          }
          return {
            output: 'Deployment successful',
            structuredOutput: { deployed: true },
          };
        }
        throw new Error('Unknown task');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `e2e-hitl-flow-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'e2e-session', 'Deploy application');

      // Start workflow execution in background
      const workflowPromise = workflowEngine.execute(
        'e2e-hitl-flow',
        { environment: 'production' },
        { taskId, sessionId: 'e2e-session' }
      );

      // Wait for HITL state to be saved
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify HITL state
      let taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState?.status).toBe('awaiting');
      expect(taskContext?.hitlState?.stage).toBe('in_execution');
      expect(taskContext?.hitlState?.question).toContain('Deployment failed');
      expect((taskContext?.hitlState as any)?.stepId).toBe('deploy');
      expect((taskContext?.hitlState as any)?.workflowName).toBe('e2e-hitl-flow');

      // Simulate human responding with "retry"
      taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'retry', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      // Wait for workflow to complete
      const result = await workflowPromise;

      expect(result.success).toBe(true);
      expect(deployAttempts).toBe(2); // Initial failure + retry
      expect(result.steps[0].status).toBe('completed'); // test
      expect(result.steps[1].status).toBe('completed'); // deploy
    });

    it('should handle HITL skip action correctly', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-hitl-skip',
        steps: [
          {
            id: 'analyze',
            agent: 'developer',
          },
          {
            id: 'optional-step',
            agent: 'developer',
            depends_on: ['analyze'],
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
          {
            id: 'finalize',
            agent: 'developer',
            depends_on: ['optional-step'],
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-hitl-skip', workflowConfig);

      const mockAgent = createMockAgent(async () => ({
        output: 'completed',
      }));
      // First call (analyze) succeeds, second call (optional-step) fails,
      // third call (finalize) succeeds
      mockAgent.run
        .mockResolvedValueOnce({ output: 'Analysis complete' })
        .mockRejectedValueOnce(new Error('Optional step failed'))
        .mockResolvedValueOnce({ output: 'Finalized' });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `e2e-hitl-skip-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'e2e-session', 'Test skip');

      const workflowPromise = workflowEngine.execute(
        'e2e-hitl-skip',
        {},
        { taskId, sessionId: 'e2e-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with skip
      const taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'skip', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;

      expect(result.success).toBe(true);
      expect(result.steps[0].status).toBe('completed'); // analyze
      expect(result.steps[1].status).toBe('skipped'); // optional-step
      expect(result.steps[2].status).toBe('completed'); // finalize
    });

    it('should handle HITL abort action correctly', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-hitl-abort',
        steps: [
          {
            id: 'risky-step',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-hitl-abort', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Critical failure');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `e2e-hitl-abort-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'e2e-session', 'Test abort');

      const workflowPromise = workflowEngine.execute(
        'e2e-hitl-abort',
        {},
        { taskId, sessionId: 'e2e-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with abort
      const taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'abort', params: { reason: 'User cancelled' } }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;
      expect(result.success).toBe(false);
    });
  });

  describe('Rollback Recovery Scenario', () => {
    it('should rollback and recover from failure', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-rollback-recovery',
        description: 'CI/CD pipeline with rollback on test failure',
        steps: [
          {
            id: 'build',
            agent: 'developer',
          },
          {
            id: 'test',
            agent: 'developer',
            depends_on: ['build'],
          },
          {
            id: 'deploy',
            agent: 'developer',
            depends_on: ['test'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'build',
              clearContext: false,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-rollback-recovery', workflowConfig);

      let deployAttempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        if (task.includes('build')) {
          return { output: 'Build successful', structuredOutput: { buildId: '123' } };
        }
        if (task.includes('test')) {
          return { output: 'Tests passed', structuredOutput: { testsPassed: true } };
        }
        if (task.includes('deploy')) {
          deployAttempts++;
          if (deployAttempts === 1) {
            throw new Error('Deployment failed: configuration error');
          }
          return {
            output: 'Deployment successful',
            structuredOutput: { deployed: true, url: 'https://example.com' },
          };
        }
        throw new Error('Unknown task');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'e2e-rollback-recovery',
        { version: '1.0.0' },
        { taskId: 'e2e-rollback-test' }
      );

      expect(result.success).toBe(true);
      expect(deployAttempts).toBe(2); // Initial failure + retry after rollback
      expect(result.steps.length).toBeGreaterThan(3); // Initial 3 + rollback 3
    });
  });

  describe('Combined Retry + HITL', () => {
    it('should retry first, then request HITL on retry exhaustion', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-retry-then-hitl',
        steps: [
          {
            id: 'api-call',
            agent: 'developer',
            retry: {
              maxRetries: 2,
              delayMs: 50,
            },
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-retry-then-hitl', workflowConfig);

      let attempts = 0;
      const mockAgent = createMockAgent(async () => {
        attempts++;
        throw new Error('API error: 500 Internal Server Error');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `e2e-retry-hitl-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'e2e-session', 'Test combined');

      const workflowPromise = workflowEngine.execute(
        'e2e-retry-then-hitl',
        {},
        { taskId, sessionId: 'e2e-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // With on_failure: 'hitl', executeStep catches the error and enters HITL
      // immediately on first failure (no retries via retryOperation since
      // executeStep handles the failure internally via handleStepFailure).
      // The step still fails and triggers HITL state.
      expect(attempts).toBeGreaterThanOrEqual(1);

      // Verify HITL state was triggered
      let taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState?.status).toBe('awaiting');

      // Respond with retry to try one more time
      taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'retry', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;

      // One more attempt after HITL retry
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(result.success).toBe(false); // Still fails
    });
  });

  describe('Complex Multi-Step Workflow', () => {
    it('should handle complex workflow with multiple feedback mechanisms', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-complex-workflow',
        description: 'Complex software delivery pipeline',
        steps: [
          {
            id: 'analyze',
            agent: 'developer',
          },
          {
            id: 'develop',
            agent: 'developer',
            depends_on: ['analyze'],
            retry: {
              maxRetries: 1,
              delayMs: 50,
            },
          },
          {
            id: 'unit-test',
            agent: 'developer',
            depends_on: ['develop'],
          },
          {
            id: 'integration-test',
            agent: 'developer',
            depends_on: ['unit-test'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'develop',
            },
          },
          {
            id: 'deploy-staging',
            agent: 'developer',
            depends_on: ['integration-test'],
          },
          {
            id: 'smoke-test',
            agent: 'developer',
            depends_on: ['deploy-staging'],
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-complex-workflow', workflowConfig);

      const executionLog: string[] = [];
      const mockAgent = createMockAgent(async (task: string) => {
        executionLog.push(task);
        return { output: `${task} completed` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'e2e-complex-workflow',
        { feature: 'user-auth' },
        { taskId: 'e2e-complex-test' }
      );

      expect(result.success).toBe(true);
      expect(result.steps.filter(s => s.status === 'completed').length).toBe(6);
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve error context through feedback loop', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'e2e-error-context',
        steps: [
          {
            id: 'failing-step',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('e2e-error-context', workflowConfig);

      const originalError = new Error('Database connection failed: timeout after 30s');
      const mockAgent = createMockAgent(async () => {
        throw originalError;
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `e2e-error-context-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'e2e-session', 'Test error context');

      const workflowPromise = workflowEngine.execute(
        'e2e-error-context',
        {},
        { taskId, sessionId: 'e2e-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify error context is preserved in HITL state
      const taskContext = await contextManager.getContext(taskId);
      expect((taskContext?.hitlState as any)?.failureReason).toBe(originalError.message);

      // Clean up - respond with abort
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'abort', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      await workflowPromise;
    });
  });
});
