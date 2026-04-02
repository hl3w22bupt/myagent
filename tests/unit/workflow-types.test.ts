/**
 * Workflow Types Test
 *
 * Tests for Workflow Feedback Loop type definitions
 */

import { describe, it, expect } from '@jest/globals';
import {
  WorkflowStep,
  RetryConfig,
  FailureHandler,
  RollbackConfig,
  HITLConfig,
  HITLOption,
} from '../../src/core/workflow/types';

describe('Workflow Feedback Loop Types', () => {
  describe('RetryConfig', () => {
    it('should accept valid retry config', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        delayMs: 1000,
        exponentialBackoff: true,
        maxDelayMs: 30000,
        jitterFactor: 0.1,
      };

      expect(config.maxRetries).toBe(3);
      expect(config.delayMs).toBe(1000);
      expect(config.exponentialBackoff).toBe(true);
    });

    it('should accept minimal retry config', () => {
      const config: RetryConfig = {
        maxRetries: 2,
      };

      expect(config.maxRetries).toBe(2);
      expect(config.delayMs).toBeUndefined();
    });

    it('should accept custom retryable checker', () => {
      const customChecker = (error: Error) => {
        return error.message.includes('timeout');
      };

      const config: RetryConfig = {
        maxRetries: 1,
        isRetryable: customChecker,
      };

      expect(config.isRetryable).toBeDefined();
    });
  });

  describe('FailureHandler', () => {
    it('should accept valid failure handlers', () => {
      const handlers: FailureHandler[] = ['retry', 'skip', 'rollback', 'hitl'];

      handlers.forEach(handler => {
        expect(['retry', 'skip', 'rollback', 'hitl']).toContain(handler);
      });
    });
  });

  describe('RollbackConfig', () => {
    it('should accept valid rollback config', () => {
      const config: RollbackConfig = {
        targetStepId: 'step-1',
        clearContext: false,
        resetRetries: true,
      };

      expect(config.targetStepId).toBe('step-1');
      expect(config.clearContext).toBe(false);
      expect(config.resetRetries).toBe(true);
    });

    it('should accept minimal rollback config', () => {
      const config: RollbackConfig = {
        targetStepId: 'step-2',
      };

      expect(config.targetStepId).toBe('step-2');
      expect(config.clearContext).toBeUndefined();
    });
  });

  describe('HITLConfig', () => {
    it('should accept valid HITL config', () => {
      const config: HITLConfig = {
        timeout: 600000,
        pollInterval: 10000,
        question: 'What should we do?',
        context: { error: 'Something failed' },
      };

      expect(config.timeout).toBe(600000);
      expect(config.pollInterval).toBe(10000);
      expect(config.question).toBe('What should we do?');
      expect(config.context).toEqual({ error: 'Something failed' });
    });

    it('should accept minimal HITL config', () => {
      const config: HITLConfig = {};

      expect(config.timeout).toBeUndefined();
      expect(config.pollInterval).toBeUndefined();
    });
  });

  describe('HITLOption', () => {
    it('should accept valid HITL options', () => {
      const options: HITLOption[] = [
        {
          id: 'retry',
          label: '重试',
          description: '重新执行',
          action: 'retry',
          params: { stepId: 'step-1' },
          style: 'primary',
        },
        {
          id: 'skip',
          label: '跳过',
          action: 'skip',
          style: 'secondary',
        },
        {
          id: 'abort',
          label: '中止',
          action: 'abort',
          style: 'danger',
        },
      ];

      expect(options).toHaveLength(3);
      expect(options[0].action).toBe('retry');
      expect(options[0].style).toBe('primary');
      expect(options[1].action).toBe('skip');
      expect(options[2].action).toBe('abort');
    });

    it('should accept minimal HITL option', () => {
      const option: HITLOption = {
        id: 'retry',
        label: '重试',
        action: 'retry',
      };

      expect(option.id).toBe('retry');
      expect(option.label).toBe('重试');
      expect(option.action).toBe('retry');
      expect(option.description).toBeUndefined();
      expect(option.params).toBeUndefined();
      expect(option.style).toBeUndefined();
    });
  });

  describe('WorkflowStep', () => {
    it('should accept step with retry config', () => {
      const step: WorkflowStep = {
        id: 'test-step',
        agent: 'developer',
        retry: {
          maxRetries: 3,
          delayMs: 1000,
        },
      };

      expect(step.id).toBe('test-step');
      expect(step.retry?.maxRetries).toBe(3);
    });

    it('should accept step with failure handler', () => {
      const handlers: FailureHandler[] = ['retry', 'skip', 'rollback', 'hitl'];

      handlers.forEach(handler => {
        const step: WorkflowStep = {
          id: `test-${handler}`,
          agent: 'developer',
          on_failure: handler,
        };

        expect(step.on_failure).toBe(handler);
      });
    });

    it('should accept step with rollback config', () => {
      const step: WorkflowStep = {
        id: 'test-rollback',
        agent: 'developer',
        on_failure: 'rollback',
        rollbackConfig: {
          targetStepId: 'step-1',
          clearContext: false,
        },
      };

      expect(step.on_failure).toBe('rollback');
      expect(step.rollbackConfig?.targetStepId).toBe('step-1');
    });

    it('should accept step with HITL config', () => {
      const step: WorkflowStep = {
        id: 'test-hitl',
        agent: 'developer',
        on_failure: 'hitl',
        hitl: {
          timeout: 300000,
          pollInterval: 5000,
          options: [
            {
              id: 'retry',
              label: '重试',
              action: 'retry',
              style: 'primary',
            },
            {
              id: 'abort',
              label: '中止',
              action: 'abort',
              style: 'danger',
            },
          ],
        },
      };

      expect(step.on_failure).toBe('hitl');
      expect(step.hitl?.timeout).toBe(300000);
      expect(step.hitl?.options).toHaveLength(2);
    });

    it('should accept step with all feedback loop configs', () => {
      const step: WorkflowStep = {
        id: 'complete-step',
        agent: 'developer',
        retry: { maxRetries: 2 },
        on_failure: 'hitl',
        rollbackConfig: { targetStepId: 'step-1' },
        hitl: {
          options: [
            { id: 'retry', label: '重试', action: 'retry' },
          ],
        },
      };

      expect(step.retry?.maxRetries).toBe(2);
      expect(step.on_failure).toBe('hitl');
      expect(step.rollbackConfig?.targetStepId).toBe('step-1');
      expect(step.hitl?.options).toBeDefined();
    });

    it('should accept step without feedback loop configs', () => {
      const step: WorkflowStep = {
        id: 'simple-step',
        agent: 'developer',
        input: { task: 'test' },
      };

      expect(step.retry).toBeUndefined();
      expect(step.on_failure).toBeUndefined();
      expect(step.rollbackConfig).toBeUndefined();
      expect(step.hitl).toBeUndefined();
    });

    it('should accept step with other existing fields', () => {
      const step: WorkflowStep = {
        id: 'complex-step',
        name: 'Complex Step',
        agent: 'developer',
        type: 'agent',
        depends_on: ['step-1', 'step-2'],
        input: { task: 'test task' },
        output: { result: 'output.result' },
        timeout: 60000,
        always_run: true,
        // Feedback loop fields
        retry: { maxRetries: 1 },
        on_failure: 'skip',
      };

      expect(step.id).toBe('complex-step');
      expect(step.depends_on).toEqual(['step-1', 'step-2']);
      expect(step.always_run).toBe(true);
      expect(step.retry?.maxRetries).toBe(1);
      expect(step.on_failure).toBe('skip');
    });
  });
});
