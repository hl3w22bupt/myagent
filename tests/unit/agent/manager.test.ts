/**
 * Unit tests for AgentManager.
 */

import { AgentManager } from '../../../src/core/agent/manager';
import { AgentConfig } from '../../../src/core/agent/types';

describe('AgentManager', () => {
  let manager: AgentManager;
  let config: AgentConfig;

  beforeEach(() => {
    // Mock Agent configuration
    config = {
      systemPrompt: 'You are a helpful assistant',
      availableSkills: ['web-search', 'summarize'],
      llm: {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
      },
      sandbox: {
        type: 'local',
        config: {}, // Empty config uses defaults
      },
    };

    // Create manager with short timeouts for testing
    manager = new AgentManager({
      sessionTimeout: 5000, // 5 seconds
      maxSessions: 3,
      agentConfig: config,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('acquire()', () => {
    it('should create new Agent for new session', async () => {
      const agent = await manager.acquire('session-1');

      expect(agent).toBeDefined();
      expect(manager.getSessionCount()).toBe(1);
    });

    it('should return existing Agent for known session', async () => {
      const agent1 = await manager.acquire('session-1');
      const agent2 = await manager.acquire('session-1');

      expect(agent1).toBe(agent2);
      expect(manager.getSessionCount()).toBe(1);
    });

    it('should create different Agents for different sessions', async () => {
      const agent1 = await manager.acquire('session-1');
      const agent2 = await manager.acquire('session-2');

      expect(agent1).not.toBe(agent2);
      expect(manager.getSessionCount()).toBe(2);
    });

    it('should evict oldest session when limit exceeded', async () => {
      // Fill up to max
      await manager.acquire('session-1');
      await manager.acquire('session-2');
      await manager.acquire('session-3');

      expect(manager.getSessionCount()).toBe(3);

      // Add one more - should evict oldest
      await manager.acquire('session-4');

      expect(manager.getSessionCount()).toBe(3);
      expect(manager.getActiveSessions()).not.toContain('session-1');
    });
  });

  describe('release()', () => {
    it('should remove session and cleanup Agent', async () => {
      await manager.acquire('session-1');
      expect(manager.getSessionCount()).toBe(1);

      await manager.release('session-1');
      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSessions()).not.toContain('session-1');
    });

    it('should handle releasing non-existent session', async () => {
      await expect(manager.release('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getActiveSessions()', () => {
    it('should return list of active session IDs', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');

      const sessions = manager.getActiveSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
    });

    it('should return empty array when no sessions', () => {
      const sessions = manager.getActiveSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('getSessionCount()', () => {
    it('should return correct session count', async () => {
      expect(manager.getSessionCount()).toBe(0);

      await manager.acquire('session-1');
      expect(manager.getSessionCount()).toBe(1);

      await manager.acquire('session-2');
      expect(manager.getSessionCount()).toBe(2);

      await manager.release('session-1');
      expect(manager.getSessionCount()).toBe(1);
    });
  });

  describe('shutdown()', () => {
    it('should cleanup all sessions', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');

      expect(manager.getSessionCount()).toBe(2);

      await manager.shutdown();

      expect(manager.getSessionCount()).toBe(0);
    });
  });
});
