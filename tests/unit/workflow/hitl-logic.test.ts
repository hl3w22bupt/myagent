/**
 * Workflow HITL (Human-In-The-Loop) Logic Tests
 *
 * Tests HITL behavior for workflow steps including:
 * - HITL state saving
 * - Polling for response
 * - Action execution (retry, skip, rollback, abort)
 * - Timeout handling
 */

import { WorkflowEngine } from '../../../src/core/workflow/engine';
import { AgentManager } from '../../../src/core/agent/manager';
import { ContextManager } from '../../../src/core/context/manager';
import { WorkflowConfig } from '../../../src/core/workflow/types';
import { getDataStore } from '../../../src/core/database/data-store';

describe('Workflow HITL Logic', () => {
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

  describe('HITL State Saving', () => {
    it('should save HITL state on step failure', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-state',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 1000,
              timeout: 5000,
              question: 'Step failed. What should we do?',
              options: [
                {
                  id: 'retry',
                  label: 'Retry',
                  action: 'retry',
                },
                {
                  id: 'skip',
                  label: 'Skip',
                  action: 'skip',
                },
              ],
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-state', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Step execution failed');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      // Create a task context first (use unique ID to avoid duplicate key errors)
      const taskId = `hitl-state-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      // Start workflow execution (will fail and request HITL)
      const workflowPromise = workflowEngine.execute(
        'test-hitl-state',
        {},
        { taskId, sessionId: 'test-session' }
      );

      // Wait a bit for HITL state to be saved
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check HITL state was saved
      const taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState).toBeDefined();
      expect(taskContext?.hitlState?.status).toBe('awaiting');
      expect(taskContext?.hitlState?.stage).toBe('in_execution');
      expect(taskContext?.hitlState?.question).toContain('Step failed');

      // Clean up - we need to respond to HITL or it will timeout
      // For now, let the timeout happen
      await workflowPromise;
    });

    it('should include workflow-specific fields in HITL state', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-workflow-fields',
        steps: [
          {
            id: 'failing-step',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 1000,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-workflow-fields', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Custom failure');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-fields-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-workflow-fields',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const taskContext = await contextManager.getContext(taskId);
      expect((taskContext?.hitlState as any)?.workflowName).toBe('test-hitl-workflow-fields');
      expect((taskContext?.hitlState as any)?.stepId).toBe('failing-step');
      expect((taskContext?.hitlState as any)?.failureReason).toBe('Custom failure');

      // Let timeout happen
      await workflowPromise;
    });
  });

  describe('HITL Polling', () => {
    it('should poll for HITL response', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-polling',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-polling', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Polling test');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-polling-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-polling',
        {},
        { taskId, sessionId: 'test-session' }
      );

      // Wait for HITL state to be saved
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify HITL state is awaiting
      const taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState?.status).toBe('awaiting');

      // Simulate user responding
      await new Promise(resolve => setTimeout(resolve, 200));
      const latestContext = await contextManager.getContext(taskId);
      if (latestContext?.hitlState) {
        latestContext.hitlState.status = 'completed';
        latestContext.hitlState.response = {
          content: JSON.stringify({ action: 'skip', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(latestContext);
      }

      const result = await workflowPromise;
      expect(result.steps[0].status).toBe('skipped');
    });

    it('should timeout after configured duration', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-timeout',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 200,
              timeout: 1000, // Short timeout for testing
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-timeout', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Timeout test');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-timeout-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const startTime = Date.now();
      const result = await workflowEngine.execute(
        'test-hitl-timeout',
        {},
        { taskId, sessionId: 'test-session' }
      );
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(false);
      // After HITL timeout, the step result has the error
      expect(result.steps[0]?.error).toContain('timeout');
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(2000); // Should not wait much longer than timeout
    });
  });

  describe('HITL Actions', () => {
    it('should execute retry action', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-retry',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-retry', workflowConfig);

      let attemptCount = 0;
      const mockAgent = createMockAgent(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('First attempt fails');
        }
        return { output: 'Success on retry' };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-retry-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-retry',
        {},
        { taskId, sessionId: 'test-session' }
      );

      // Wait for HITL state
      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with retry action
      const taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'retry', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
    });

    it('should execute skip action', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-skip',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
          {
            id: 'step2',
            agent: 'developer',
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-skip', workflowConfig);

      // step1 fails (triggers HITL), step2 succeeds
      let callCount = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        callCount++;
        // First call is step1, which fails
        if (task.includes('step1') || callCount === 1) {
          throw new Error('Step 1 fails');
        }
        // Second call is step2, which succeeds
        return { output: 'Step 2 succeeds' };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-skip-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-skip',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with skip action
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
      expect(result.steps[0].status).toBe('skipped');
      expect(result.steps[1].status).toBe('completed');
    });

    it('should handle abort action via HITL', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-abort',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 200,
              timeout: 2000, // Short timeout for testing
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-abort', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Abort test');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-abort-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-abort',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with abort action
      const taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'abort', params: { reason: 'User aborted' } }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;
      expect(result.success).toBe(false);
    });

    it('should parse text responses as actions', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-text-response',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-text-response', workflowConfig);

      let attemptCount = 0;
      const mockAgent = createMockAgent(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Text response test');
        }
        return { output: 'Success' };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-text-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-text-response',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with text instead of JSON
      const taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: 'Please retry the step',
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2);
    });
  });

  describe('HITL Cleanup', () => {
    it('should complete workflow after HITL skip action', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-cleanup',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'hitl',
            hitl: {
              pollInterval: 500,
              timeout: 5000,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-hitl-cleanup', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Cleanup test');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = `hitl-cleanup-test-${Date.now()}`;
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-cleanup',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify HITL state exists
      const taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState).toBeDefined();

      // Respond with skip
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'skip', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
      }

      const result = await workflowPromise;

      // Verify workflow completed with skipped step
      expect(result.success).toBe(true);
      expect(result.steps[0].status).toBe('skipped');
    });
  });
});
