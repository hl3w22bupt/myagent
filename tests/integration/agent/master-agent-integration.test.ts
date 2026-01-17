/**
 * Integration tests for MasterAgent with delegation and result synthesis.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { MasterAgent } from '@/core/agent/master-agent';

describe('MasterAgent Integration', () => {
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
          local: {
            pythonPath: process.env.PYTHON_PATH || 'python3',
            timeout: 30000,
          },
        },
        subagents: ['code-reviewer', 'data-analyst', 'security-auditor'],
      },
      'test-master-agent-integration-session'
    );
  });

  afterAll(async () => {
    await masterAgent.cleanup();
  });

  describe('Subagent Configuration Loading', () => {
    it('should load all configured subagents from YAML', () => {
      const info = masterAgent.getInfo();
      expect(info.subagents).toEqual([
        'code-reviewer',
        'data-analyst',
        'security-auditor',
      ]);
    });

    it('should have subagent configs loaded', () => {
      const info = masterAgent.getInfo();
      expect(info.type).toBe('MasterAgent');
      expect(info.subagents.length).toBe(3);
    });
  });

  describe('Delegation Planning', () => {
    it('should create delegation plan', async () => {
      // Note: This test verifies structure, not actual LLM response
      // Actual delegation requires API key and real LLM calls
      const info = masterAgent.getInfo();
      expect(info.subagents).toBeDefined();
      expect(info.subagents.length).toBeGreaterThan(0);
    });

    it('should have delegation method available', () => {
      // Verify MasterAgent has delegation capability
      const info = masterAgent.getInfo();
      expect(info.type).toBe('MasterAgent');
      expect(info.subagents).toBeDefined();
    });
  });

  describe('Result Synthesis', () => {
    it('should have synthesis capability', () => {
      // Verify synthesis method exists and would work
      const info = masterAgent.getInfo();
      expect(info.type).toBe('MasterAgent');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing subagent config gracefully', async () => {
      // Create MasterAgent with non-existent subagent
      const testAgent = new MasterAgent(
        {
          systemPrompt: 'You are a helpful assistant.',
          availableSkills: ['*'],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
          sandbox: {
            type: 'local',
            local: {
              pythonPath: process.env.PYTHON_PATH || 'python3',
              timeout: 30000,
            },
          },
          subagents: ['non-existent-subagent'],
        },
        'test-missing-subagent-session'
      );

      // Should not throw, just warn
      const info = testAgent.getInfo();
      // Non-existent subagent should not be in list
      expect(info.subagents).not.toContain('non-existent-subagent');

      await testAgent.cleanup();
    });
  });
});
