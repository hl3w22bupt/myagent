/**
 * Unit tests for SoulScheduler
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { SoulScheduler } from '@/core/scheduler/soul-scheduler';
import { SoulAgent } from '@/core/agent/soul-agent';
import { soulConfigLoader } from '@/core/config/soul-config-loader';
import { subagentConfigLoader } from '@/core/config/subagent-config-loader';

describe('SoulScheduler', () => {
  let scheduler: SoulScheduler;
  let soulConfig: any;
  let subagentConfig: any;

  beforeAll(async () => {
    // Load configurations
    soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
    subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

    // Add sandbox config for testing
    subagentConfig = {
      ...subagentConfig,
      sandbox: {
        type: 'local',
        local: {
          pythonPath: 'python3',
          timeout: 5000,
        }
      }
    };

    // Monkey patch subagentConfigLoader to return modified config
    const originalLoad = subagentConfigLoader.loadSubagentConfig.bind(subagentConfigLoader);
    subagentConfigLoader.loadSubagentConfig = async (name: string) => {
      if (name === 'emotional-girlfriend-lively') {
        return subagentConfig;
      }
      return originalLoad(name);
    };
  });

  beforeEach(() => {
    scheduler = SoulScheduler.getInstance();
  });

  afterEach(async () => {
    // Cleanup after each test
    const stats = scheduler.getStats();
    if (stats.activeSouls > 0 || stats.hibernatedSouls > 0) {
      await scheduler.shutdown();
    }
  });

  afterAll(async () => {
    // Final cleanup to ensure no timers remain
    await scheduler.shutdown();
  });

  describe('singleton pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = SoulScheduler.getInstance();
      const instance2 = SoulScheduler.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('activateSoul', () => {
    it('should activate soul successfully', async () => {
      const soulAgent = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-1');

      expect(soulAgent).toBeDefined();
      expect(soulAgent.getSessionId()).toBe('test-session-1');
    });

    it('should cache active soul in memory', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-2');

      const isActive = scheduler.isSoulActive('test-session-2');
      expect(isActive).toBe(true);
    });

    it('should return existing soul if already active', async () => {
      const soulAgent1 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-3');
      const soulAgent2 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-3');

      expect(soulAgent1).toBe(soulAgent2);
    });

    it('should update last activity on re-activation', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-4');

      const soulAgent = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-4');
      const state = soulAgent.getSoulState();

      expect(state.lastActivity).toBeDefined();
      expect(state.lastActivity).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('getActiveSoul', () => {
    it('should return undefined for non-active soul', () => {
      const soulAgent = scheduler.getActiveSoul('non-existent-session');
      expect(soulAgent).toBeUndefined();
    });

    it('should return active soul', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-5');

      const soulAgent = scheduler.getActiveSoul('test-session-5');
      expect(soulAgent).toBeDefined();
      if (soulAgent) {
        expect(soulAgent.getSessionId()).toBe('test-session-5');
      }
    });
  });

  describe('isSoulActive', () => {
    it('should return false for non-active soul', () => {
      expect(scheduler.isSoulActive('non-existent-session')).toBe(false);
    });

    it('should return true for active soul', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-6');

      expect(scheduler.isSoulActive('test-session-6')).toBe(true);
    });
  });

  describe('isSoulHibernated', () => {
    it('should return false for non-hibernated soul', () => {
      expect(scheduler.isSoulHibernated('non-existent-session')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return scheduler statistics', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-7');
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-8');

      const stats = scheduler.getStats();

      expect(stats).toHaveProperty('activeSouls');
      expect(stats).toHaveProperty('hibernatedSouls');
      expect(stats).toHaveProperty('totalSouls');
      expect(stats.activeSouls).toBeGreaterThanOrEqual(2);
      expect(stats.totalSouls).toBeGreaterThanOrEqual(2);
    });

    it('should calculate total souls correctly', async () => {
      const statsBefore = scheduler.getStats();

      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-9');

      const statsAfter = scheduler.getStats();
      expect(statsAfter.totalSouls).toBe(statsBefore.totalSouls + 1);
    });
  });

  describe('hibernateSoul', () => {
    it('should hibernate active soul', async () => {
      const soulAgent = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-10');

      await scheduler.hibernateSoul(soulAgent);

      expect(scheduler.isSoulActive('test-session-10')).toBe(false);
    });

    it('should update soul state to HIBERNATED', async () => {
      const soulAgent = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-11');

      await scheduler.hibernateSoul(soulAgent);

      const state = soulAgent.getSoulState();
      expect(state.status).toBe('HIBERNATED');
    });
  });

  describe('shutdown', () => {
    it('should hibernate all active souls', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-12');
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-13');

      await scheduler.shutdown();

      expect(scheduler.isSoulActive('test-session-12')).toBe(false);
      expect(scheduler.isSoulActive('test-session-13')).toBe(false);
    });

    it('should update stats after shutdown', async () => {
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-14');
      await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-15');

      await scheduler.shutdown();

      const stats = scheduler.getStats();
      expect(stats.activeSouls).toBe(0);
    });
  });

  describe('multiple souls management', () => {
    it('should handle multiple active souls', async () => {
      const soul1 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-16');
      const soul2 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-17');
      const soul3 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-18');

      expect(scheduler.isSoulActive('test-session-16')).toBe(true);
      expect(scheduler.isSoulActive('test-session-17')).toBe(true);
      expect(scheduler.isSoulActive('test-session-18')).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.activeSouls).toBeGreaterThanOrEqual(3);
    });

    it('should maintain separate state for each session', async () => {
      const soul1 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-19');
      const soul2 = await scheduler.activateSoul('emotional-girlfriend-lively', 'test-session-20');

      expect(soul1.getSessionId()).not.toBe(soul2.getSessionId());
    });
  });
});
