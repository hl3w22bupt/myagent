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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Step execution failed')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      // Create a task context first
      const taskId = 'hitl-state-test';
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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Custom failure')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-fields-test';
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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Polling test')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-polling-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-polling',
        {},
        { taskId, sessionId: 'test-session' }
      );

      // Wait for HITL state to be saved
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify HITL state is awaiting
      let taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState?.status).toBe('awaiting');

      // Simulate user responding
      await new Promise(resolve => setTimeout(resolve, 200));
      taskContext = await contextManager.getContext(taskId);
      if (taskContext?.hitlState) {
        taskContext.hitlState.status = 'completed';
        taskContext.hitlState.response = {
          content: JSON.stringify({ action: 'skip', params: {} }),
          timestamp: new Date(),
        };
        await contextManager.saveContext(taskContext);
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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Timeout test')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-timeout-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const startTime = Date.now();
      const result = await workflowEngine.execute(
        'test-hitl-timeout',
        {},
        { taskId, sessionId: 'test-session' }
      );
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1500); // Should not wait much longer than timeout
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('First attempt fails');
          }
          return { output: 'Success on retry' };
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-retry-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-retry',
        {},
        { taskId, sessionId: 'test-session' }
      );

      // Wait for HITL state
      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with retry action
      let taskContext = await contextManager.getContext(taskId);
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

      const mockAgent = {
        run: jest.fn()
          .mockRejectedValueOnce(new Error('Step 1 fails'))
          .mockResolvedValueOnce({ output: 'Step 2 succeeds' }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-skip-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-skip',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with skip action
      let taskContext = await contextManager.getContext(taskId);
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

    it('should execute abort action', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-hitl-abort',
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

      workflowEngine.registerWorkflow('test-hitl-abort', workflowConfig);

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Abort test')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-abort-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-abort',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with abort action
      let taskContext = await contextManager.getContext(taskId);
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
      expect(result.error).toContain('aborted');
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Text response test');
          }
          return { output: 'Success' };
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-text-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-text-response',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Respond with text instead of JSON
      let taskContext = await contextManager.getContext(taskId);
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
    it('should clear HITL state after action execution', async () => {
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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Cleanup test')),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const taskId = 'hitl-cleanup-test';
      await contextManager.createTaskContext(taskId, 'test-session', 'test input');

      const workflowPromise = workflowEngine.execute(
        'test-hitl-cleanup',
        {},
        { taskId, sessionId: 'test-session' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify HITL state exists
      let taskContext = await contextManager.getContext(taskId);
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

      await workflowPromise;

      // Verify HITL state was cleared
      taskContext = await contextManager.getContext(taskId);
      expect(taskContext?.hitlState).toBeUndefined();
    });
  });
});
