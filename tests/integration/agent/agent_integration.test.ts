/**
 * Integration tests for Agent + Sandbox + Skills.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { MasterAgent } from '@/core/agent/master-agent';

describe('Agent Integration', () => {
  describe('Agent + Sandbox', () => {
    let agent: Agent;

    beforeAll(() => {
      const sessionId = 'test-agent-integration-session';
      agent = new Agent({
        systemPrompt: 'You are a helpful assistant.',
        availableSkills: ['summarize', 'code-analysis'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5'
        },
        sandbox: {
          type: 'local',
          config: {}
        }
      }, sessionId);
    });

    afterAll(async () => {
      await agent.cleanup();
    });

    it('should initialize agent with sandbox', () => {
      expect(agent).toBeDefined();
      const info = agent.getInfo();
      expect(info.sandboxType).toBe('local');
    });

    it('should generate execution steps', () => {
      // This test verifies the structure without actual execution
      const info = agent.getInfo();
      expect(info.sessionId).toBeDefined();
      expect(info.availableSkills).toBeDefined();
    });
  });

  describe('MasterAgent + Subagents', () => {
    let masterAgent: MasterAgent;

    beforeAll(() => {
      const sessionId = 'test-master-agent-integration-session';
      masterAgent = new MasterAgent({
        systemPrompt: 'You are a helpful assistant.',
        availableSkills: ['*'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5'
        },
        sandbox: {
          type: 'local',
          config: {}
        },
        subagents: ['code-reviewer', 'data-analyst']
      }, sessionId);
    });

    afterAll(async () => {
      await masterAgent.cleanup();
    });

    it('should initialize with multiple subagents', () => {
      expect(masterAgent).toBeDefined();
      const info = masterAgent.getInfo();
      expect(info.subagents).toContain('code-reviewer');
      expect(info.subagents).toContain('data-analyst');
    });

    it('should have delegation capability', () => {
      // MasterAgent extends Agent with delegation
      const info = masterAgent.getInfo();
      expect(info.type).toBe('MasterAgent');
      expect(info.subagents.length).toBeGreaterThan(0);
    });
  });
});
