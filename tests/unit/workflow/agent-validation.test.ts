/**
 * Agent Validation Tests
 *
 * Tests workflow agent reference validation at load time
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorkflowValidator } from '../../../src/core/workflow/validator';
import type { WorkflowConfig } from '../../../src/core/workflow/types';

describe('WorkflowValidator - Agent References', () => {
  describe('with agent validation enabled', () => {
    let validator: WorkflowValidator;

    beforeEach(() => {
      validator = new WorkflowValidator({
        availableSubagents: ['developer-engineer', 'code-reviewer', 'data-analyst'],
        hasMasterAgent: true,
      });
    });

    it('should pass validation when all agents exist', () => {
      const config: WorkflowConfig = {
        name: 'valid-workflow',
        description: 'Workflow with valid agents',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'developer-engineer',
            input: { task: 'Write code' },
          },
          {
            id: 'step2',
            name: 'Step 2',
            agent: 'code-reviewer',
            depends_on: ['step1'],
            input: { task: 'Review code' },
          },
          {
            id: 'step3',
            name: 'Step 3',
            agent: 'master',
            depends_on: ['step2'],
            input: { task: 'Final check' },
          },
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should fail when agent does not exist', () => {
      const config: WorkflowConfig = {
        name: 'invalid-workflow',
        description: 'Workflow with invalid agent',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'non-existent-agent',
            input: { task: 'Write code' },
          },
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        stepId: 'step1',
        field: 'agent',
        error: expect.stringContaining('Agent "non-existent-agent" not found'),
      });
      expect(errors[0].error).toContain('Available agents:');
    });

    it('should fail when agent field is missing', () => {
      const config: WorkflowConfig = {
        name: 'missing-agent-workflow',
        description: 'Workflow with missing agent field',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            input: { task: 'Write code' },
          } as any,
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        stepId: 'step1',
        field: 'agent',
        error: 'Agent field is required',
      });
    });

    it('should validate multiple steps with mixed valid/invalid agents', () => {
      const config: WorkflowConfig = {
        name: 'mixed-workflow',
        description: 'Workflow with mixed agents',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'developer-engineer',
            input: { task: 'Write code' },
          },
          {
            id: 'step2',
            name: 'Step 2',
            agent: 'invalid-agent',
            depends_on: ['step1'],
            input: { task: 'Invalid step' },
          },
          {
            id: 'step3',
            name: 'Step 3',
            agent: 'code-reviewer',
            depends_on: ['step2'],
            input: { task: 'Review code' },
          },
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(1);
      expect(errors[0].stepId).toBe('step2');
    });
  });

  describe('with agent validation disabled (backward compatibility)', () => {
    it('should skip agent validation when no options provided', () => {
      const validator = new WorkflowValidator();

      const config: WorkflowConfig = {
        name: 'any-agent-workflow',
        description: 'Workflow with any agent',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'any-random-agent',
            input: { task: 'Task' },
          },
        ],
      };

      const errors = validator.validate(config);
      // Agent validation is skipped, but other validations still run
      const agentErrors = errors.filter(e => e.field === 'agent');
      expect(agentErrors).toHaveLength(0);
    });

    it('should include master agent when hasMasterAgent is true', () => {
      const validator = new WorkflowValidator({
        availableSubagents: ['developer-engineer'],
        hasMasterAgent: true,
      });

      const config: WorkflowConfig = {
        name: 'master-workflow',
        description: 'Workflow using master agent',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'master',
            input: { task: 'Delegate task' },
          },
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should not include master agent when hasMasterAgent is false', () => {
      const validator = new WorkflowValidator({
        availableSubagents: ['developer-engineer'],
        hasMasterAgent: false,
      });

      const config: WorkflowConfig = {
        name: 'invalid-master-workflow',
        description: 'Workflow using master when not available',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            agent: 'master',
            input: { task: 'Delegate task' },
          },
        ],
      };

      const errors = validator.validate(config);
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toContain('Agent "master" not found');
    });
  });

  describe('error message quality', () => {
    it('should list all available agents in error message', () => {
      const validator = new WorkflowValidator({
        availableSubagents: ['agent-a', 'agent-b', 'agent-c'],
        hasMasterAgent: false,
      });

      const config: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'step1',
            agent: 'agent-x',
            input: { task: 'Test' },
          } as any,
        ],
      };

      const errors = validator.validate(config);
      expect(errors[0].error).toBe(
        'Agent "agent-x" not found. Available agents: agent-a, agent-b, agent-c'
      );
    });

    it('should show "none" when no agents available', () => {
      const validator = new WorkflowValidator({
        availableSubagents: [],
        hasMasterAgent: false,
      });

      const config: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'step1',
            agent: 'agent-x',
            input: { task: 'Test' },
          } as any,
        ],
      };

      const errors = validator.validate(config);
      expect(errors[0].error).toBe(
        'Agent "agent-x" not found. Available agents: none'
      );
    });

    it('should include master in available agents when enabled', () => {
      const validator = new WorkflowValidator({
        availableSubagents: ['agent-a'],
        hasMasterAgent: true,
      });

      const config: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'step1',
            agent: 'agent-x',
            input: { task: 'Test' },
          } as any,
        ],
      };

      const errors = validator.validate(config);
      expect(errors[0].error).toContain('master');
      expect(errors[0].error).toBe(
        'Agent "agent-x" not found. Available agents: agent-a, master'
      );
    });
  });
});
