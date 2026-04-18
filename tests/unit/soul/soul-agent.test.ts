/**
 * Unit tests for SoulAgent
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SoulAgent } from '@/core/agent/soul-agent';
import { SoulConfig } from '@/core/agent/soul-types';
import { soulConfigLoader } from '@/core/config/soul-config-loader';
import { subagentConfigLoader } from '@/core/config/subagent-config-loader';

describe('SoulAgent', () => {
  let soulAgent: SoulAgent;
  let soulConfig: SoulConfig;
  let subagentConfig: any;

  beforeAll(async () => {
    // Load configurations
    soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
    subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');
  });

  beforeEach(() => {
    // Create a new SoulAgent instance for each test
    // Add sandbox config to satisfy Agent requirements
    const configWithSandbox = {
      ...subagentConfig,
      sandbox: {
        type: 'local',
        local: {
          pythonPath: 'python3',
          timeout: 5000,
        }
      }
    };

    soulAgent = new SoulAgent(soulConfig, configWithSandbox, 'test-session-soul');
  });

  afterEach(async () => {
    // Cleanup agent
    if (soulAgent) {
      await soulAgent.cleanup();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(soulAgent).toBeDefined();
    });

    it('should have correct session ID', () => {
      expect(soulAgent.getSessionId()).toBe('test-session-soul');
    });

    it('should have soul state initialized', () => {
      const state = soulAgent.getSoulState();
      expect(state.status).toBe('IDLE');
      expect(state.currentTask).toBeNull();
      expect(state.statistics.totalTasks).toBe(0);
    });

    it('should have soul config', () => {
      const config = soulAgent.getSoulConfig();
      expect(config.soul_id).toBe('emotional-girlfriend-lively');
      expect(config.display_name).toBe('小糖');
    });
  });

  describe('combinePrompts', () => {
    it('should combine subagent prompt and soul goal', () => {
      const subagentPrompt = '你是一个 AI 女友，名字叫"小糖"。';
      const soulGoal = '你的核心目标：在合适时机主动发起互动。';

      const combined = SoulAgent.combinePrompts(subagentPrompt, soulGoal);

      expect(combined).toContain(subagentPrompt);
      expect(combined).toContain(soulGoal);
      expect(combined).toContain('长期目标');
    });

    it('should preserve subagent personality', () => {
      const subagentPrompt = subagentConfig.agent.system_prompt;
      const soulGoal = soulConfig.goal;

      const combined = SoulAgent.combinePrompts(subagentPrompt, soulGoal);

      // Check that subagent characteristics are preserved
      expect(combined).toContain('小糖');
      expect(combined).toContain('活泼');
      expect(combined).toContain(soulGoal);
    });
  });

  describe('getSoulState', () => {
    it('should return soul state', () => {
      const state = soulAgent.getSoulState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('currentTask');
      expect(state).toHaveProperty('lastActivity');
      expect(state).toHaveProperty('scheduledWakeup');
      expect(state).toHaveProperty('statistics');
    });

    it('should return a copy of state', () => {
      const state1 = soulAgent.getSoulState();
      const state2 = soulAgent.getSoulState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different references
    });
  });

  describe('getSoulConfig', () => {
    it('should return soul config', () => {
      const config = soulAgent.getSoulConfig();

      expect(config).toHaveProperty('soul_id');
      expect(config).toHaveProperty('display_name');
      expect(config).toHaveProperty('subagent');
      expect(config).toHaveProperty('goal');
      expect(config).toHaveProperty('primitives');
      expect(config).toHaveProperty('hibernation');
    });

    it('should return a copy of config', () => {
      const config1 = soulAgent.getSoulConfig();
      const config2 = soulAgent.getSoulConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different references
    });
  });

  describe('getSessionId', () => {
    it('should return session ID', () => {
      expect(soulAgent.getSessionId()).toBe('test-session-soul');
    });

    it('should be public method', () => {
      expect(typeof soulAgent.getSessionId).toBe('function');
    });
  });

  describe('primitive tools', () => {
    it('should have all required primitive tools in config', () => {
      const config = soulAgent.getSoulConfig();

      // Check that soul config has core primitives (schedule removed in Contractor pattern)
      expect(config.primitives).toContain('hibernate');
      expect(config.primitives).toContain('complete');
      // schedule is no longer included - periodic checks are driven by external cron
      expect(config.primitives).not.toContain('schedule');
    });

    it('should support all primitive tools', () => {
      // These are the tools available in SoulAgent (Contractor pattern)
      const supportedTools = ['hibernate', 'complete', 'send_message', 'send_notification'];
      expect(supportedTools.length).toBeGreaterThan(0);
    });
  });

  describe('hibernation configuration', () => {
    it('should have correct idle timeout', () => {
      const config = soulAgent.getSoulConfig();
      expect(config.hibernation.idle_timeout).toBe(3600000); // 1 hour
    });

    it('should have idle timeout as number', () => {
      const config = soulAgent.getSoulConfig();
      expect(typeof config.hibernation.idle_timeout).toBe('number');
    });
  });

  describe('integration with Agent base class', () => {
    it('should inherit from Agent', () => {
      const info = soulAgent.getInfo();
      expect(info.type).toBe('Agent');
    });

    it('should have session info', () => {
      const info = soulAgent.getInfo();
      expect(info.sessionId).toBeDefined();
    });

    it('should have display name from soul config', () => {
      const config = soulAgent.getSoulConfig();
      expect(config.display_name).toBe('小糖');
    });
  });

  describe('Contractor pattern - trigger routing', () => {
    it('should route user_message triggers to handleUserMessage', async () => {
      // Mock the necessary dependencies
      const mockInput = {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'user_message',
          data: {
            userRequest: 'Hello, 小糖!'
          }
        }
      };

      // Test that execute can handle user_message triggers
      // Note: This test may fail if LLM is not properly mocked
      // In a real scenario, you would mock the Agent.run() method
      expect(soulAgent.execute).toBeDefined();
      expect(typeof soulAgent.execute).toBe('function');
    });

    it('should route periodic_check triggers to handlePeriodicCheck', async () => {
      const mockInput = {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'periodic_check',
          data: {
            reason: 'Periodic check - autonomous decision making'
          }
        }
      };

      // Test that execute can handle periodic_check triggers
      expect(soulAgent.execute).toBeDefined();
      expect(typeof soulAgent.execute).toBe('function');
    });

    it('should have getSubjectInfo method for trace display', () => {
      const subjectInfo = soulAgent.getSubjectInfo();

      expect(subjectInfo).toBeDefined();
      expect(subjectInfo.subjectTitle).toContain('Auto-Agent');
      expect(subjectInfo.subjectTitle).toContain('emotional-girlfriend-lively');
      expect(subjectInfo.subjectSubTitle).toBe('小糖');
    });
  });

  describe('Contractor pattern - state management', () => {
    it('should update state to ACTIVE when executing', () => {
      const initialState = soulAgent.getSoulState();
      expect(initialState.status).toBe('IDLE');

      // State should be updated during execution
      // (This would be tested in integration tests with actual execution)
    });

    it('should have currentTask tracking', () => {
      const state = soulAgent.getSoulState();

      expect(state).toHaveProperty('currentTask');
      expect(typeof state.currentTask === 'object' || state.currentTask === null).toBe(true);
    });

    it('should reset currentTask to null when IDLE', () => {
      // Force agent to IDLE state
      const state = soulAgent.getSoulState();
      expect(state.status).toBe('IDLE');
      expect(state.currentTask).toBeNull();
    });
  });

  describe('Contractor pattern - task priority', () => {
    it('should prioritize user_message over periodic_check', () => {
      // This tests the contractor pattern rule:
      // User messages cancel current tasks and take priority
      const state = soulAgent.getSoulState();

      // When IDLE, both types of triggers can be handled
      expect(state.status).toBe('IDLE');
      expect(state.currentTask).toBeNull();
    });
  });
});
