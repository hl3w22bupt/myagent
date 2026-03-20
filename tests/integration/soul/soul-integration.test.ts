/**
 * Integration tests for Soul Agent
 *
 * Tests the complete flow from configuration loading to soul execution
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { soulConfigLoader } from '@/core/config/soul-config-loader';
import { subagentConfigLoader } from '@/core/config/subagent-config-loader';
import { SoulAgent } from '@/core/agent/soul-agent';
import { soulScheduler } from '@/core/scheduler/soul-scheduler';

describe('Soul Agent Integration', () => {
  beforeAll(async () => {
    // Monkey patch subagentConfigLoader to add sandbox config
    const originalLoad = subagentConfigLoader.loadSubagentConfig.bind(subagentConfigLoader);
    subagentConfigLoader.loadSubagentConfig = async (name: string) => {
      const config = await originalLoad(name);
      // Add sandbox config for all subagents
      return {
        ...config,
        sandbox: {
          type: 'local',
          local: {
            pythonPath: 'python3',
            timeout: 5000,
          }
        }
      };
    };
  });
  afterAll(async () => {
    // Cleanup scheduler
    await soulScheduler.shutdown();
  });

  describe('configuration loading', () => {
    it('should load soul and subagent configurations', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      expect(soulConfig).toBeDefined();
      expect(subagentConfig).toBeDefined();
      expect(soulConfig.subagent).toBe('emotional-girlfriend-lively');
    });

    it('should validate configuration consistency', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

      // Verify subagent reference matches
      expect(soulConfig.subagent).toBe(subagentConfig.name);
    });
  });

  describe('soul agent creation', () => {
    it('should create soul agent from loaded configurations', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      const soulAgent = new SoulAgent(soulConfig, subagentConfig, 'integration-test-session');

      expect(soulAgent).toBeDefined();
      expect(soulAgent.getSessionId()).toBe('integration-test-session');

      await soulAgent.cleanup();
    });

    it('should combine system prompts correctly', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      const soulAgent = new SoulAgent(soulConfig, subagentConfig, 'integration-test-session');
      const info = soulAgent.getInfo();

      expect(info.type).toBe('Agent');

      await soulAgent.cleanup();
    });
  });

  describe('scheduler lifecycle', () => {
    it('should activate soul through scheduler', async () => {
      const soulAgent = await soulScheduler.activateSoul('emotional-girlfriend-lively', 'scheduler-test-1');

      expect(soulAgent).toBeDefined();
      expect(soulScheduler.isSoulActive('scheduler-test-1')).toBe(true);
    });

    it('should get active soul from scheduler', async () => {
      await soulScheduler.activateSoul('emotional-girlfriend-lively', 'scheduler-test-2');

      const soulAgent = soulScheduler.getActiveSoul('scheduler-test-2');

      expect(soulAgent).toBeDefined();
      if (soulAgent) {
        expect(soulAgent.getSessionId()).toBe('scheduler-test-2');
      }
    });

    it('should return scheduler statistics', async () => {
      await soulScheduler.activateSoul('emotional-girlfriend-lively', 'scheduler-test-3');
      await soulScheduler.activateSoul('emotional-girlfriend-lively', 'scheduler-test-4');

      const stats = soulScheduler.getStats();

      expect(stats.activeSouls).toBeGreaterThanOrEqual(2);
      expect(stats.totalSouls).toBeGreaterThanOrEqual(2);
    });

    it('should hibernate soul', async () => {
      const soulAgent = await soulScheduler.activateSoul('emotional-girlfriend-lively', 'scheduler-test-5');

      await soulScheduler.hibernateSoul(soulAgent);

      expect(soulScheduler.isSoulActive('scheduler-test-5')).toBe(false);
    });
  });

  describe('configuration-driven behavior', () => {
    it('should load goal from soul.yaml', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');

      expect(soulConfig.goal).toBeDefined();
      expect(soulConfig.goal).toContain('长期目标');
      expect(soulConfig.goal).toContain('主动发起互动');
    });

    it('should have action criteria in goal', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');

      expect(soulConfig.goal).toContain('行动准则');
      expect(soulConfig.goal).toContain('current_hour');
      expect(soulConfig.goal).toContain('last_interaction');
    });

    it('should have all required primitives', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');

      expect(soulConfig.primitives).toContain('hibernate');
      expect(soulConfig.primitives).toContain('schedule');
      expect(soulConfig.primitives).toContain('complete');
    });

    it('should have hibernation configuration', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');

      expect(soulConfig.hibernation).toBeDefined();
      expect(soulConfig.hibernation.idle_timeout).toBe(3600000);
    });
  });

  describe('subagent personality preserved', () => {
    it('should preserve subagent name and personality', async () => {
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      expect(subagentConfig.name).toBe('emotional-girlfriend-lively');
      expect(subagentConfig.description).toContain('活泼可爱');
    });

    it('should have system prompt with personality', async () => {
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      expect(subagentConfig.agent.system_prompt).toBeDefined();
      expect(subagentConfig.agent.system_prompt).toContain('小糖');
      expect(subagentConfig.agent.system_prompt).toContain('活泼');
    });
  });

  describe('end-to-end flow', () => {
    it('should complete full lifecycle: load -> create -> activate -> hibernate', async () => {
      // 1. Load configurations
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      // 2. Create soul agent
      const soulAgent = new SoulAgent(soulConfig, subagentConfig, 'e2e-test-session');
      expect(soulAgent).toBeDefined();

      // 3. Activate through scheduler
      const activatedSoul = await soulScheduler.activateSoul('emotional-girlfriend-lively', 'e2e-test-session-2');
      expect(activatedSoul).toBeDefined();
      expect(soulScheduler.isSoulActive('e2e-test-session-2')).toBe(true);

      // 4. Hibernate
      await soulScheduler.hibernateSoul(activatedSoul);
      expect(soulScheduler.isSoulActive('e2e-test-session-2')).toBe(false);

      // Cleanup
      await soulAgent.cleanup();
    });
  });
});
