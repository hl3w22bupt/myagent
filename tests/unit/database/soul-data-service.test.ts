/**
 * Unit tests for Soul Data Services
 *
 * Tests soul_states and soul_contexts database operations
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { soulStateDataService } from '@/core/database/soul-data-service';
import { soulContextManager } from '@/core/context/soul-context-manager';
const soulContextDataService = soulContextManager as any;
import { SoulState } from '@/core/agent/soul-types';
import { getDataStore } from '@/core/database/data-store';

describe('Soul Data Services', () => {
  const testSessionId = 'test-soul-session';
  const testUserId = 'test-user-123';
  const testSoulId = 'emotional-girlfriend-lively';

  beforeAll(async () => {
    // Ensure database is initialized
    const store = getDataStore();
    await store.initialize();
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await soulStateDataService.deleteSoulState(testSessionId);
    } catch (error) {
      // Ignore if doesn't exist
    }
  });

  describe('SoulStateDataService', () => {
    it('should save soul state', async () => {
      const state: SoulState = {
        status: 'ACTIVE',
        currentTask: 'test-task',
        lastActivity: Date.now(),
        scheduledWakeup: null,
        activeSince: null,
        statistics: {
          totalTasks: 5,
          uptime: 3600000
        }
      };

      await soulStateDataService.saveSoulState(testSessionId, testSoulId, state);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should get soul state', async () => {
      const state = await soulStateDataService.getSoulState(testSessionId);

      expect(state).toBeDefined();
      expect(state?.status).toBe('ACTIVE');
      expect(state?.currentTask).toBe('test-task');
      expect(state?.statistics.totalTasks).toBe(5);
    });

    it('should return null for non-existent soul state', async () => {
      const state = await soulStateDataService.getSoulState('non-existent-session');

      expect(state).toBeNull();
    });

    it('should update soul state on save', async () => {
      const updatedState: SoulState = {
        status: 'HIBERNATED',
        currentTask: null,
        lastActivity: Date.now(),
        scheduledWakeup: null,
        activeSince: null,
        statistics: {
          totalTasks: 10,
          uptime: 7200000
        }
      };

      await soulStateDataService.saveSoulState(testSessionId, testSoulId, updatedState);

      const retrieved = await soulStateDataService.getSoulState(testSessionId);

      expect(retrieved?.status).toBe('HIBERNATED');
      expect(retrieved?.statistics.totalTasks).toBe(10);
    });

    it('should get active soul states', async () => {
      // Save another active state
      const activeSessionId = 'test-active-session';
      const activeState: SoulState = {
        status: 'ACTIVE',
        currentTask: 'active-task',
        lastActivity: Date.now(),
        scheduledWakeup: null,
        activeSince: null,
        statistics: {
          totalTasks: 1,
          uptime: 1000
        }
      };

      await soulStateDataService.saveSoulState(activeSessionId, testSoulId, activeState);

      const activeStates = await soulStateDataService.getActiveSoulStates(testSoulId);

      expect(activeStates.length).toBeGreaterThan(0);
      expect(activeStates.find(s => s.sessionId === activeSessionId)).toBeDefined();
    });

    it('should delete soul state', async () => {
      const tempSessionId = 'test-temp-session';
      const tempState: SoulState = {
        status: 'ACTIVE',
        currentTask: null,
        lastActivity: Date.now(),
        scheduledWakeup: null,
        activeSince: null,
        statistics: {
          totalTasks: 0,
          uptime: 0
        }
      };

      await soulStateDataService.saveSoulState(tempSessionId, testSoulId, tempState);

      // Delete
      await soulStateDataService.deleteSoulState(tempSessionId);

      // Verify deleted
      const retrieved = await soulStateDataService.getSoulState(tempSessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('SoulContextDataService', () => {
    it('should save soul context', async () => {
      const userProfile = {
        name: '测试用户',
        age: 25,
        interests: ['游戏', '电影']
      };

      const relationshipState = {
        intimacy: 75,
        chatDays: 10,
        lastInteraction: new Date().toISOString()
      };

      const conversationRounds = [
        {
          role: 'user',
          content: '你好',
          timestamp: Date.now()
        }
      ];

      await soulContextDataService.saveSoulContext(
        testSessionId,
        testUserId,
        userProfile,
        relationshipState,
        conversationRounds
      );

      // Should not throw
      expect(true).toBe(true);
    });

    it('should get soul context', async () => {
      const context = await soulContextDataService.getSoulContext(testSessionId);

      expect(context).toBeDefined();
      expect(context?.userId).toBe(testUserId);
      expect(context?.userProfile.name).toBe('测试用户');
      expect(context?.relationshipState.intimacy).toBe(75);
    });

    it('should return null for non-existent soul context', async () => {
      const context = await soulContextDataService.getSoulContext('non-existent-session');

      expect(context).toBeNull();
    });

    it('should add conversation message', async () => {
      await soulContextDataService.addConversationMessage(
        testSessionId,
        'assistant',
        '你好呀～'
      );

      const context = await soulContextDataService.getSoulContext(testSessionId);

      expect(context).toBeDefined();
      expect(context?.conversationRounds.length).toBe(2); // Original + new
      expect(context?.conversationRounds[1].content).toBe('你好呀～');
    });

    it('should update user profile', async () => {
      await soulContextDataService.updateUserProfile(testSessionId, {
        age: 26
      });

      const context = await soulContextDataService.getSoulContext(testSessionId);

      expect(context?.userProfile.age).toBe(26);
    });

    it('should update relationship state', async () => {
      await soulContextDataService.updateRelationshipState(testSessionId, {
        intimacy: 80
      });

      const context = await soulContextDataService.getSoulContext(testSessionId);

      expect(context?.relationshipState.intimacy).toBe(80);
    });

    it('should get recent conversations', async () => {
      // Add more conversations
      await soulContextDataService.addConversationMessage(testSessionId, 'user', '在干嘛');
      await soulContextDataService.addConversationMessage(testSessionId, 'assistant', '想你呀～');

      const conversations = await soulContextDataService.getRecentConversations(testSessionId, 2);

      expect(conversations.length).toBe(2);
      expect(conversations[1].content).toBe('想你呀～');
    });
  });

  describe('Integration: SoulState and SoulContext', () => {
    it('should maintain consistency between state and context', async () => {
      const integrationSessionId = 'test-integration-session';

      // Save state
      const state: SoulState = {
        status: 'ACTIVE',
        currentTask: 'integration-task',
        lastActivity: Date.now(),
        scheduledWakeup: null,
        activeSince: null,
        statistics: {
          totalTasks: 1,
          uptime: 5000
        }
      };

      await soulStateDataService.saveSoulState(integrationSessionId, testSoulId, state);

      // Save context
      const userProfile = { name: '集成测试用户' };
      const relationshipState = { intimacy: 50 };

      await soulContextDataService.saveSoulContext(
        integrationSessionId,
        testUserId,
        userProfile,
        relationshipState,
        []
      );

      // Retrieve both
      const retrievedState = await soulStateDataService.getSoulState(integrationSessionId);
      const retrievedContext = await soulContextDataService.getSoulContext(integrationSessionId);

      expect(retrievedState?.status).toBe('ACTIVE');
      expect(retrievedContext?.userProfile.name).toBe('集成测试用户');

      // Cleanup
      await soulStateDataService.deleteSoulState(integrationSessionId);
    });
  });
});
