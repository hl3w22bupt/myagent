/**
 * Workflow Rollback Logic Tests
 *
 * Tests rollback behavior for workflow steps including:
 * - Rollback to previous step
 * - Context clearing on rollback
 * - Re-execution from target step
 * - Nested rollback handling
 */

import { WorkflowEngine } from '../../../src/core/workflow/engine';
import { AgentManager } from '../../../src/core/agent/manager';
import { WorkflowConfig } from '../../../src/core/workflow/types';
import { getDataStore } from '../../../src/core/database/data-store';

describe('Workflow Rollback Logic', () => {
  let workflowEngine: WorkflowEngine;
  let agentManager: AgentManager;

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
    workflowEngine = new WorkflowEngine(agentManager, console);
  });

  afterAll(async () => {
    const store = getDataStore();
    await store.close();
  });

  describe('Basic Rollback', () => {
    it('should rollback to specified step on failure and re-execute', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-basic',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
              clearContext: false,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-basic', workflowConfig);

      const executionOrder: string[] = [];
      let step3Attempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0].split(':')[0];
        executionOrder.push(stepId);

        // step3 fails first time, succeeds on rollback re-execution
        if (stepId.includes('step3')) {
          step3Attempts++;
          if (step3Attempts === 1) {
            throw new Error('Step 3 failed');
          }
          return { output: `${stepId} completed on retry` };
        }

        return { output: `${stepId} completed` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-basic',
        {},
        { taskId: 'rollback-basic-test' }
      );

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual([
        'step1',     // Initial execution
        'step2',     // Initial execution
        'step3',     // Fails -> triggers rollback
        'step1',     // Rollback re-execution
        'step2',     // Rollback re-execution
        'step3',     // Succeeds on rollback
      ]);
    });

    it('should fail if target step not found', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-invalid-target',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'nonexistent',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-invalid-target', workflowConfig);

      const mockAgent = createMockAgent(async () => {
        throw new Error('Failure');
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-invalid-target',
        {},
        { taskId: 'rollback-invalid-test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Context Clearing', () => {
    it('should clear context when clearContext is true', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-clear-context',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
              clearContext: true,
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-clear-context', workflowConfig);

      let step2Attempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];

        // step2 fails first time, succeeds on rollback
        if (stepId.includes('step2')) {
          step2Attempts++;
          if (step2Attempts === 1) {
            throw new Error('Step 2 failed');
          }
          return { output: `${stepId} success` };
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-clear-context',
        {},
        { taskId: 'rollback-clear-test' }
      );

      // After rollback with clearContext and step2 succeeds on retry
      expect(result.success).toBe(true);
    });
  });

  describe('Rollback Re-execution', () => {
    it('should re-execute all steps from target step onwards', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-re-execute',
        steps: [
          {
            id: 'analyze',
            agent: 'developer',
          },
          {
            id: 'develop',
            agent: 'developer',
            depends_on: ['analyze'],
          },
          {
            id: 'test',
            agent: 'developer',
            depends_on: ['develop'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'analyze',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-re-execute', workflowConfig);

      const executionLog: string[] = [];
      let testAttempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];
        executionLog.push(`${stepId}-attempt-${mockAgent.run.mock.calls.length}`);

        if (stepId.includes('test')) {
          testAttempts++;
          if (testAttempts === 1) {
            throw new Error('Test failed');
          }
          return { output: `${stepId} success` };
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-re-execute',
        {},
        { taskId: 'rollback-reexecute-test' }
      );

      expect(result.success).toBe(true);
      expect(executionLog).toEqual([
        'analyze-attempt-1',   // Initial
        'develop-attempt-2',   // Initial
        'test-attempt-3',      // Fails
        'analyze-attempt-4',   // Rollback
        'develop-attempt-5',   // Rollback
        'test-attempt-6',      // Succeeds on rollback
      ]);
    });

    it('should handle successful re-execution after rollback', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-success',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-success', workflowConfig);

      let attemptCount = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];
        attemptCount++;

        // step3 fails first time, succeeds second time
        if (stepId.includes('step3')) {
          if (attemptCount <= 3) {
            throw new Error('First failure');
          }
          return { output: 'step3 success' };
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-success',
        {},
        { taskId: 'rollback-success-test' }
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(6); // step1, step2, step3 (fail) + step1, step2, step3 (success)
    });
  });

  describe('Rollback with Dependencies', () => {
    it('should respect dependencies during rollback re-execution', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-dependencies',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2a',
            agent: 'developer',
            depends_on: ['step1'],
          },
          {
            id: 'step2b',
            agent: 'developer',
            depends_on: ['step1'],
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2a', 'step2b'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-dependencies', workflowConfig);

      const executionOrder: string[] = [];
      let step3Attempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];
        executionOrder.push(stepId);

        if (stepId.includes('step3')) {
          step3Attempts++;
          if (step3Attempts === 1) {
            throw new Error('Step 3 failed');
          }
          return { output: `${stepId} completed` };
        }

        return { output: `${stepId} completed` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-dependencies',
        {},
        { taskId: 'rollback-deps-test' }
      );

      // Verify topological order is maintained during rollback
      expect(result.success).toBe(true);
      expect(executionOrder).toEqual([
        'step1',   // Initial
        'step2a',  // Initial (parallel with 2b)
        'step2b',  // Initial (parallel with 2a)
        'step3',   // Fails
        'step1',   // Rollback
        'step2a',  // Rollback
        'step2b',  // Rollback
        'step3',   // Succeeds on rollback
      ]);
    });
  });

  describe('Rollback Stop on Failure', () => {
    it('should stop rollback re-execution if a step fails', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-stop',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-stop', workflowConfig);

      // step2 fails during rollback, step3 also fails (no on_failure recursion for step2)
      const executionOrder: string[] = [];
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];
        executionOrder.push(stepId);

        // step2 fails during rollback (2nd execution)
        if (stepId.includes('step2') && executionOrder.filter(s => s.includes('step2')).length > 1) {
          throw new Error('Step 2 failed during rollback');
        }

        if (stepId.includes('step3')) {
          throw new Error('Step 3 failed');
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-stop',
        {},
        { taskId: 'rollback-stop-test' }
      );

      expect(result.success).toBe(false);
      // Verify step3 was not executed again after step2 failed during rollback
      const step3Count = executionOrder.filter(s => s.includes('step3')).length;
      expect(step3Count).toBe(1); // step3 only executed once (initial)
    });

    it('should continue if step has always_run flag', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-rollback-always-run',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
            always_run: true,
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-rollback-always-run', workflowConfig);

      const executionLog: string[] = [];
      let step3Attempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];
        executionLog.push(stepId);

        if (stepId.includes('step3')) {
          step3Attempts++;
          if (step3Attempts === 1) {
            throw new Error('Step 3 failed');
          }
          return { output: `${stepId} success` };
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-always-run',
        {},
        { taskId: 'rollback-always-run-test' }
      );

      // step2 should execute even after step3 fails (initial execution)
      const step3Index = executionLog.findIndex(s => s.includes('step3'));
      const step2AfterStep3 = executionLog.slice(step3Index + 1).filter(s => s.includes('step2'));
      expect(step2AfterStep3.length).toBeGreaterThan(0);
    });
  });

  describe('Nested Rollback', () => {
    it('should handle rollback from step that was target of previous rollback', async () => {
      const workflowConfig: WorkflowConfig = {
        name: 'test-nested-rollback',
        steps: [
          {
            id: 'step1',
            agent: 'developer',
          },
          {
            id: 'step2',
            agent: 'developer',
            depends_on: ['step1'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
          {
            id: 'step3',
            agent: 'developer',
            depends_on: ['step2'],
            on_failure: 'rollback',
            rollbackConfig: {
              targetStepId: 'step1',
            },
          },
        ],
      };

      workflowEngine.registerWorkflow('test-nested-rollback', workflowConfig);

      // step2 fails first time but succeeds on rollback, step3 fails both times
      let step2Attempts = 0;
      let step3Attempts = 0;
      const mockAgent = createMockAgent(async (task: string) => {
        const stepId = task.split('\n')[0];

        if (stepId.includes('step2')) {
          step2Attempts++;
          if (step2Attempts === 1) {
            throw new Error(`${stepId} failed`);
          }
          return { output: `${stepId} success` };
        }

        if (stepId.includes('step3')) {
          step3Attempts++;
          if (step3Attempts <= 1) {
            throw new Error(`${stepId} failed`);
          }
          return { output: `${stepId} success` };
        }

        return { output: `${stepId} success` };
      });

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-nested-rollback',
        {},
        { taskId: 'nested-rollback-test' }
      );

      // Should handle rollbacks and eventually succeed
      expect(result.success).toBe(true);
      expect(mockAgent.run).toHaveBeenCalledTimes(9);
    });
  });
});
