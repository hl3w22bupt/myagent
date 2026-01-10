/**
 * Unit tests for Agent and PTC Generator.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { MasterAgent } from '@/core/agent/master-agent';

describe('Agent', () => {
  let agent: Agent;

  beforeAll(() => {
    agent = new Agent(
      {
        systemPrompt: 'You are a helpful assistant.',
        availableSkills: ['summarize', 'code-analysis'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          type: 'local',
          config: {
            pythonPath: 'python3',
            timeout: 5000,
          },
        },
      },
      'test-session-1'
    );
  });

  afterAll(async () => {
    await agent.cleanup();
  });

  it('should initialize successfully', () => {
    expect(agent).toBeDefined();
    const info = agent.getInfo();
    expect(info.type).toBe('Agent');
    expect(info.sessionId).toBeDefined();
  });

  it('should have available skills', () => {
    const info = agent.getInfo();
    expect(info.availableSkills).toContain('summarize');
    expect(info.availableSkills).toContain('code-analysis');
  });

  it('should get agent info', () => {
    const info = agent.getInfo();
    expect(info).toHaveProperty('sessionId');
    expect(info).toHaveProperty('llmModel');
  });
});

describe('MasterAgent', () => {
  let masterAgent: MasterAgent;

  beforeAll(() => {
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
          config: {
            pythonPath: 'python3',
            timeout: 5000,
          },
        },
        subagents: ['code-reviewer'],
      },
      'test-session-master-1'
    );
  });

  afterAll(async () => {
    await masterAgent.cleanup();
  });

  it('should initialize with subagents', () => {
    expect(masterAgent).toBeDefined();
    const info = masterAgent.getInfo();
    expect(info.type).toBe('MasterAgent');
    expect(info.subagents).toContain('code-reviewer');
  });

  it('should have more capabilities than base Agent', () => {
    const info = masterAgent.getInfo();
    expect(info.subagents).toBeDefined();
    expect(info.subagents.length).toBeGreaterThan(0);
  });
});
