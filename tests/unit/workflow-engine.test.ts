/**
 * Workflow Engine Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorkflowEngine } from '../../src/core/workflow/engine';
import { WorkflowContext } from '../../src/core/workflow/context';
import { WorkflowValidator } from '../../src/core/workflow/validator';
import type { ValidationError } from '../../src/core/workflow/types';

// Mock AgentManager
class MockAgentManager {
  private agents = new Map<string, any>();

  registerAgent(id: string, agent: any) {
    this.agents.set(id, agent);
  }

  async acquire(_sessionId: string, options?: { agentType?: string }): Promise<any> {
    const agentType = options?.agentType || 'agent';
    const agent = this.agents.get(agentType);
    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }
    return agent;
  }

  // Add minimal properties for type compatibility
  sessions = new Map();
  sessionTypes = new Map();
  lastActivity = new Map();
  config = { sessionTimeout: 300000, maxSessions: 100, agentConfig: {} };
  cleanupTimer = undefined;
  hookManager = { register: () => {}, unregister: () => {}, executeHook: async () => {} };
  getSessionCount = () => this.sessions.size;
  getActiveSessions = () => Array.from(this.sessions.keys());
  release = async () => {};
  shutdown = async () => {};
  cleanupExpiredSessions = async () => {};
  evictOldestSession = async () => {};
  registerHook = () => {};
  unregisterHook = () => {};
  getHookManager = () => this.hookManager;
}

// Mock Agent
class MockAgent {
  constructor(public name: string) {}

  updateLLMTraceConfig(_taskId?: string): void {
    // Mock method
  }

  async run(task: string, _taskId?: string, _context?: any): Promise<any> {
    // Parse task if it's JSON string
    let taskInput: any;
    try {
      taskInput = JSON.parse(task);
    } catch {
      taskInput = { task };
    }

    // Build structured output
    const structuredOutput: any = {
      agent: this.name,
      task,
      timestamp: new Date().toISOString(),
    };

    // Handle include flag for conditional tests
    // Check if task description contains "include: true" or "include: false"
    if (task.includes('include: true')) {
      structuredOutput.flag = true;
    } else if (task.includes('include: false')) {
      structuredOutput.flag = false;
    } else if (taskInput.include !== undefined) {
      structuredOutput.flag = taskInput.include === true;
    }

    // Extract step ID from various input patterns
    if (typeof task === 'string' && task.includes('step')) {
      const match = task.match(/step(\d+)/);
      if (match) {
        structuredOutput.step = match[1];
      }
    }

    return {
      success: true,
      output: `Executed: ${task}`,
      structuredOutput,
    };
  }

  // Run with different signature for testing
  async runWithOutput(task: string, _taskId?: string, _context?: any): Promise<any> {
    return {
      success: true,
      output: `Executed: ${task}`,
      structuredOutput: {
        agent: this.name,
        task,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

describe('WorkflowContext', () => {
  it('should store and retrieve variables', () => {
    const context = new WorkflowContext('test-workflow', { topic: 'Test' });

    // Set intermediate variable
    context.set('findings', ['result1', 'result2']);
    expect(context.get('findings')).toEqual(['result1', 'result2']);
  });

  it('should handle input variables', () => {
    const context = new WorkflowContext('test-workflow', { topic: 'Test' });
    expect(context.get('input.topic')).toBe('Test');
  });

  it('should handle output variables', () => {
    const context = new WorkflowContext('test-workflow', {});
    context.set('output.result', 'Final result');
    expect(context.get('output.result')).toBe('Final result');
  });

  it('should handle loop variables', () => {
    const context = new WorkflowContext('test-workflow', {});
    context.set('loop.index', 5);
    expect(context.get('loop.index')).toBe(5);
  });

  it('should check dependencies', () => {
    const context = new WorkflowContext('test-workflow', {});
    context.setStepStatus('step1', 'completed');

    expect(context.areDependenciesMet('step2', ['step1'])).toBe(true);
    expect(context.areDependenciesMet('step2', ['step2'])).toBe(false);
  });
});

describe('WorkflowValidator', () => {
  it('should detect duplicate output fields in same step', () => {
    const validator = new WorkflowValidator();
    const config = {
      name: 'test',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          output: {
            result: 'output',
            result2: 'output', // duplicate value, not duplicate key
          },
        },
      ],
    };

    const errors = validator.validate(config);
    expect(errors.length).toBeGreaterThan(0);
    // Check that the error mentions the duplicate fields
    expect(errors[0].field).toContain('result');
    expect(errors[0].error).toContain('Duplicate');
  });

  it('should detect reserved name conflicts', () => {
    const validator = new WorkflowValidator();
    const config = {
      name: 'test',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          output: {
            input: 'output', // reserved
          },
        },
      ],
    };

    const errors = validator.validate(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('input');
    expect(errors[0].error).toContain('reserved');
  });

  it('should detect cross-step conflicts', () => {
    const validator = new WorkflowValidator();
    const config = {
      name: 'test',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          output: {
            result: 'output',
          },
        },
        {
          id: 'step2',
          agent: 'agent2',
          output: {
            result: 'output', // conflict with step1
          },
        },
      ],
    };

    const errors = validator.validate(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].stepId).toBe('step2');
    expect(errors[0].error).toContain('Conflict');
  });

  it('should detect undefined field references', () => {
    const validator = new WorkflowValidator();
    const config = {
      name: 'test',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          input: {
            data: '{{ undefined_field }}', // not defined
          },
        },
      ],
    };

    const errors = validator.validate(config);
    expect(errors.some((e: ValidationError) => e.field === 'undefined_field')).toBe(true);
  });

  it('should detect cyclic dependencies', () => {
    const validator = new WorkflowValidator();
    const config = {
      name: 'test',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          depends_on: ['step2'],
        },
        {
          id: 'step2',
          agent: 'agent2',
          depends_on: ['step1'],
        },
      ],
    };

    const errors = validator.validate(config);
    expect(errors.some((e: ValidationError) => e.field === 'depends_on' && e.error.includes('Cyclic'))).toBe(true);
  });
});

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let agentManager: MockAgentManager;

  beforeEach(() => {
    agentManager = new MockAgentManager();
    engine = new WorkflowEngine(agentManager as any);

    // Register mock agents
    agentManager.registerAgent('researcher', new MockAgent('researcher'));
    agentManager.registerAgent('writer', new MockAgent('writer'));
    agentManager.registerAgent('reviewer', new MockAgent('reviewer'));
  });

  it('should register workflows', () => {
    const workflowConfig = {
      name: 'test-workflow',
      description: 'Test workflow',
      steps: [
        {
          id: 'step1',
          agent: 'researcher',
          input: { topic: '{{ input.topic }}' },
          output: {
            findings: 'structuredOutput.findings',
          },
        },
      ],
    };

    engine.registerWorkflow('test-workflow', workflowConfig);
    expect(engine.getWorkflow('test-workflow')).toBe(workflowConfig);
  });

  it('should execute a simple workflow', async () => {
    const workflowConfig = {
      name: 'test-workflow',
      steps: [
        {
          id: 'step1',
          agent: 'researcher',
          input: { topic: '{{ input.topic }}' },
          output: {
            findings: 'structuredOutput.findings',
          },
        },
      ],
    };

    engine.registerWorkflow('test-workflow', workflowConfig);

    const result = await engine.execute('test-workflow', { topic: 'AI Research' });

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe('completed');
  });

  it('should execute steps in dependency order', async () => {
    const executionOrder: string[] = [];

    // Track execution order using context
    const mockAgent = new MockAgent('writer');
    mockAgent.run = async (task: string, taskId?: string, context?: any): Promise<any> => {
      // Extract step ID from context (workflowStepId is set by engine)
      const stepId = context?.workflowStepId || 'unknown';
      executionOrder.push(stepId);
      return {
        success: true,
        output: `Executed ${stepId}`,
        structuredOutput: { step: stepId, value: 'result' },
      };
    };
    agentManager.registerAgent('agent1', mockAgent);
    agentManager.registerAgent('agent2', mockAgent);

    const workflowConfig = {
      name: 'ordered-workflow',
      steps: [
        {
          id: 'step1',
          agent: 'agent1',
          output: {
            result1: 'structuredOutput.value',
          },
        },
        {
          id: 'step2',
          agent: 'agent2',
          depends_on: ['step1'],
          input: {
            prev: '{{ result1 }}',
          },
        },
      ],
    };

    engine.registerWorkflow('ordered-workflow', workflowConfig);

    await engine.execute('ordered-workflow', {});

    expect(executionOrder).toEqual(['step1', 'step2']);
  });

  it('should skip steps when conditions are not met', async () => {
    const workflowConfig = {
      name: 'conditional-workflow',
      steps: [
        {
          id: 'step1',
          agent: 'researcher',
          input: { include: '{{ input.include }}' },
          output: {
            flag: 'structuredOutput.flag',
          },
        },
        {
          id: 'step2',
          agent: 'writer',
          condition: {
            field: 'flag',
            operator: '==' as const,
            value: true,
          },
        },
      ],
    };

    engine.registerWorkflow('conditional-workflow', workflowConfig);

    const result = await engine.execute('conditional-workflow', { include: false });

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[1].status).toBe('skipped');
  });

  it('should execute steps when conditions are met', async () => {
    const workflowConfig = {
      name: 'conditional-workflow-2',
      steps: [
        {
          id: 'step1',
          agent: 'researcher',
          input: { include: '{{ input.include }}' },
          output: {
            flag: 'structuredOutput.flag',
          },
        },
        {
          id: 'step2',
          agent: 'writer',
          condition: {
            field: 'flag',
            operator: '==' as const,
            value: true,
          },
        },
      ],
    };

    engine.registerWorkflow('conditional-workflow-2', workflowConfig);

    const result = await engine.execute('conditional-workflow-2', { include: true });

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[1].status).toBe('completed');
  });
});
