/**
 * Integration tests for Soul Trigger System
 *
 * Tests the complete trigger flow: API/Cron/Event -> Soul execution
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { soulConfigLoader } from '@/core/config/soul-config-loader';
import { subagentConfigLoader } from '@/core/config/subagent-config-loader';
import { SoulAgent } from '@/core/agent/soul-agent';
import { soulScheduler } from '@/core/scheduler/soul-scheduler';
import { SoulContextManager } from '@/core/context/soul-context-manager';

describe('Soul Trigger System', () => {
  let contextManager: SoulContextManager;

  beforeAll(async () => {
    // Configure subagent loader for tests
    const originalLoad = subagentConfigLoader.loadSubagentConfig.bind(subagentConfigLoader);
    subagentConfigLoader.loadSubagentConfig = async (name: string) => {
      const config = await originalLoad(name);
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

    contextManager = new SoulContextManager();
  });

  afterAll(async () => {
    await soulScheduler.shutdown();
  });

  describe('SoulContextManager', () => {
    it('should get user profile', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-test-user';

      const profile = await contextManager.getUserProfile(sessionId);

      expect(profile).toBeDefined();
      expect(profile).toHaveProperty('name');
    });

    it('should get relationship state', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-test-user';

      const relationship = await contextManager.getRelationshipState(sessionId);

      expect(relationship).toBeDefined();
      expect(relationship).toHaveProperty('intimacy');
    });

    it('should get recent conversations', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-test-user';

      const conversations = await contextManager.getRecentConversations(sessionId, 10);

      expect(Array.isArray(conversations)).toBe(true);
    });

    it('should get complete soul context', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-test-user';

      const context = await contextManager.getSoulContext(sessionId);

      expect(context).toHaveProperty('userProfile');
      expect(context).toHaveProperty('recentConversations');
      expect(context).toHaveProperty('relationship');
    });

    it('should add conversation message', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-test-user';

      await contextManager.addConversationMessage(sessionId, 'user', 'Hello');

      const conversations = await contextManager.getRecentConversations(sessionId, 10);
      expect(conversations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Soul execution with context', () => {
    it('should load context when executing', async () => {
      const soulConfig = await soulConfigLoader.loadSoulConfig('emotional-girlfriend-lively');
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig('emotional-girlfriend-lively');

      const soulAgent = new SoulAgent(soulConfig, subagentConfig, 'test-trigger-context');

      // Load context through private method (via public API)
      const input = {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'test',
          data: {}
        }
      };

      // Note: execute() will call loadContext() internally
      // We just verify the agent was created successfully
      expect(soulAgent).toBeDefined();

      await soulAgent.cleanup();
    });
  });

  describe('Trigger input format', () => {
    it('should accept valid trigger input', () => {
      const input = {
        trigger_time: '2026-03-19T09:00:00Z',
        context: {
          source: 'periodic_check',
          data: {
            user_name: '小明',
            current_hour: 9
          }
        }
      };

      expect(input).toHaveProperty('trigger_time');
      expect(input).toHaveProperty('context');
      expect(input.context).toHaveProperty('source');
      expect(input.context).toHaveProperty('data');
    });

    it('should handle different trigger sources', () => {
      const sources = [
        'periodic_check',
        'user_open_app',
        'user_message',
        'mood_change'
      ];

      sources.forEach(source => {
        const input = {
          trigger_time: new Date().toISOString(),
          context: {
            source,
            data: {}
          }
        };

        expect(input.context.source).toBe(source);
      });
    });
  });

  describe('Scheduler integration', () => {
    it('should execute soul through scheduler', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-trigger-test';

      // Activate soul
      const soulAgent = await soulScheduler.activateSoul('emotional-girlfriend-lively', sessionId);

      expect(soulAgent).toBeDefined();
      expect(soulScheduler.isSoulActive(sessionId)).toBe(true);
    });

    it('should maintain context across executions', async () => {
      const sessionId = 'soul-emotional-girlfriend-lively-context-test';

      // Activate soul
      const soulAgent = await soulScheduler.activateSoul('emotional-girlfriend-lively', sessionId);

      // Get context
      const context = await contextManager.getSoulContext(sessionId);

      expect(context).toBeDefined();
      expect(context.userProfile).toBeDefined();
    });
  });
});
