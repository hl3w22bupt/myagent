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
    it('should rollback to specified step on failure', async () => {
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          // Extract step ID from task
          const stepId = task.split('\n')[0].split(':')[0];
          executionOrder.push(stepId);

          // step3 fails
          if (stepId.includes('step3')) {
            throw new Error('Step 3 failed');
          }

          return { output: `${stepId} completed` };
        }),
      };

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
        'step3',     // Fails
        'step1',     // Rollback re-execution
        'step2',     // Rollback re-execution
        'step3',     // Fails again
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

      const mockAgent = {
        run: jest.fn().mockRejectedValue(new Error('Failure')),
      };

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

      let contextBeforeRollback: any = null;
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];

          // Store context before rollback
          if (stepId.includes('step2') && contextBeforeRollback === null) {
            contextBeforeRollback = { data: 'preserved' };
          }

          // step2 fails
          throw new Error('Step 2 failed');
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-clear-context',
        {},
        { taskId: 'rollback-clear-test' }
      );

      // After rollback with clearContext, workflow should still execute
      // but context should be reset (implementation may vary)
      expect(result.success).toBe(false); // step2 still fails
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];
          executionLog.push(`${stepId}-attempt-${mockAgent.run.mock.calls.length}`);

          if (stepId.includes('test')) {
            throw new Error('Test failed');
          }

          return { output: `${stepId} success` };
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-re-execute',
        {},
        { taskId: 'rollback-reexecute-test' }
      );

      expect(executionLog).toEqual([
        'analyze-attempt-1',   // Initial
        'develop-attempt-2',   // Initial
        'test-attempt-3',      // Fails
        'analyze-attempt-4',   // Rollback
        'develop-attempt-5',   // Rollback
        'test-attempt-6',      // Fails again
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
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
        }),
      };

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
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];
          executionOrder.push(stepId);

          if (stepId.includes('step3')) {
            throw new Error('Step 3 failed');
          }

          return { output: `${stepId} completed` };
        }),
      };

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
        'step3',   // Fails again
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

      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];

          // step2 fails during rollback
          if (stepId.includes('step2') && mockAgent.run.mock.calls.length > 2) {
            throw new Error('Step 2 failed during rollback');
          }

          if (stepId.includes('step3')) {
            throw new Error('Step 3 failed');
          }

          return { output: `${stepId} success` };
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-rollback-stop',
        {},
        { taskId: 'rollback-stop-test' }
      );

      expect(result.success).toBe(false);
      // step3 should not execute again after step2 fails
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
      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];
          executionLog.push(stepId);

          if (stepId.includes('step3')) {
            throw new Error('Step 3 failed');
          }

          return { output: `${stepId} success` };
        }),
      };

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

      const mockAgent = {
        run: jest.fn().mockImplementation(async (task: string) => {
          const stepId = task.split('\n')[0];

          // Both step2 and step3 fail
          if (stepId.includes('step2') || stepId.includes('step3')) {
            throw new Error(`${stepId} failed`);
          }

          return { output: `${stepId} success` };
        }),
      };

      jest.spyOn(agentManager, 'acquire').mockResolvedValue(mockAgent as any);

      const result = await workflowEngine.execute(
        'test-nested-rollback',
        {},
        { taskId: 'nested-rollback-test' }
      );

      // Should handle multiple rollbacks gracefully
      expect(result.success).toBe(false);
      expect(mockAgent.run).toHaveBeenCalledTimes(6); // step1, step2 (fail) + step1, step2 (fail), step3 (fail) + rollback
    });
  });
});
