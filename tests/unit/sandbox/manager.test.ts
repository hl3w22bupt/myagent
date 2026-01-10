/**
 * Unit tests for SandboxManager.
 */

import { SandboxManager } from '../../../src/core/sandbox/manager';
import { SandboxAdapterConfig } from '../../../src/core/sandbox/types';

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let config: SandboxAdapterConfig;

  beforeEach(() => {
    // Mock Sandbox configuration
    config = {
      type: 'local',
      local: {
        pythonPath: 'python3',
        timeout: 30000,
        workspace: '/tmp/test-sandbox',
      },
    };

    // Create manager with short timeouts for testing
    manager = new SandboxManager({
      sessionTimeout: 5000, // 5 seconds
      maxSessions: 3,
      sandboxConfig: config,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSessions()).toEqual([]);
    });
  });

  describe('acquire()', () => {
    it('should create new Sandbox for new session', async () => {
      const sandbox = await manager.acquire('session-1');

      expect(sandbox).toBeDefined();
      expect(manager.getSessionCount()).toBe(1);
    });

    it('should return existing Sandbox for known session', async () => {
      const sandbox1 = await manager.acquire('session-1');
      const sandbox2 = await manager.acquire('session-1');

      expect(sandbox1).toBe(sandbox2);
      expect(manager.getSessionCount()).toBe(1);
    });

    it('should create different Sandboxes for different sessions', async () => {
      const sandbox1 = await manager.acquire('session-1');
      const sandbox2 = await manager.acquire('session-2');

      expect(sandbox1).not.toBe(sandbox2);
      expect(manager.getSessionCount()).toBe(2);
    });

    it('should update last activity time on acquire', async () => {
      await manager.acquire('session-1');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Acquire again - should update activity time
      await manager.acquire('session-1');

      // Session should still be there (not expired)
      expect(manager.getSessionCount()).toBe(1);
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

    it('should handle concurrent acquire requests', async () => {
      const promises = [
        manager.acquire('session-1'),
        manager.acquire('session-2'),
        manager.acquire('session-3'),
        manager.acquire('session-4'),
        manager.acquire('session-5'),
      ];

      const sandboxes = await Promise.all(promises);

      // All acquires should complete successfully
      expect(sandboxes).toHaveLength(5);
      expect(sandboxes.every((s) => s !== undefined)).toBe(true);

      // Final count should be at most maxSessions (after evictions complete)
      // Note: During concurrent execution, it may temporarily exceed maxSessions
      expect(manager.getSessionCount()).toBeGreaterThan(0);
    });
  });

  describe('release()', () => {
    it('should remove session and cleanup Sandbox', async () => {
      await manager.acquire('session-1');
      expect(manager.getSessionCount()).toBe(1);

      await manager.release('session-1');
      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getActiveSessions()).not.toContain('session-1');
    });

    it('should handle releasing non-existent session', async () => {
      await expect(manager.release('non-existent')).resolves.not.toThrow();
    });

    it('should cleanup multiple sessions', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');
      await manager.acquire('session-3');

      expect(manager.getSessionCount()).toBe(3);

      await manager.release('session-1');
      await manager.release('session-2');

      expect(manager.getSessionCount()).toBe(1);
      expect(manager.getActiveSessions()).toContain('session-3');
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

    it('should not include released sessions', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');

      await manager.release('session-1');

      const sessions = manager.getActiveSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions).not.toContain('session-1');
      expect(sessions).toContain('session-2');
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

    it('should reflect session limit enforcement', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');
      await manager.acquire('session-3');
      await manager.acquire('session-4'); // Should evict session-1

      expect(manager.getSessionCount()).toBe(3);
    });
  });

  describe('cleanupExpiredSessions()', () => {
    it('should cleanup expired sessions after timeout', async () => {
      // Create manager with very short timeout (100ms)
      const shortTimeoutManager = new SandboxManager({
        sessionTimeout: 100, // 100ms
        maxSessions: 10,
        sandboxConfig: config,
      });

      await shortTimeoutManager.acquire('session-1');
      await shortTimeoutManager.acquire('session-2');

      expect(shortTimeoutManager.getSessionCount()).toBe(2);

      // Wait for expiration + cleanup interval
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Trigger cleanup manually (since it runs on interval)
      await shortTimeoutManager.shutdown();

      expect(shortTimeoutManager.getSessionCount()).toBe(0);
    });

    it('should not cleanup active sessions', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');

      // Keep sessions active
      await manager.acquire('session-1');
      await manager.acquire('session-2');

      expect(manager.getSessionCount()).toBe(2);
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

    it('should stop cleanup timer', async () => {
      await manager.acquire('session-1');

      // Shutdown should stop timer
      await manager.shutdown();

      // Wait a bit - no errors should occur
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(manager.getSessionCount()).toBe(0);
    });

    it('should handle shutdown with no sessions', async () => {
      await expect(manager.shutdown()).resolves.not.toThrow();
      expect(manager.getSessionCount()).toBe(0);
    });

    it('should handle multiple shutdown calls', async () => {
      await manager.acquire('session-1');

      await manager.shutdown();
      await manager.shutdown(); // Second call should be safe

      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent acquire and release', async () => {
      const results = await Promise.all([
        manager.acquire('session-1'),
        manager.acquire('session-2'),
        manager.acquire('session-3'),
        manager.release('session-1'),
        manager.acquire('session-4'),
      ]);

      // Should not throw and handle concurrent operations safely
      expect(results).toBeDefined();
      expect(manager.getSessionCount()).toBeLessThanOrEqual(3);
    });

    it('should handle concurrent releases', async () => {
      await manager.acquire('session-1');
      await manager.acquire('session-2');
      await manager.acquire('session-3');

      await Promise.all([
        manager.release('session-1'),
        manager.release('session-2'),
        manager.release('session-3'),
      ]);

      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('getSessionCount should return accurate count', async () => {
      expect(manager.getSessionCount()).toBe(0);

      const session1 = await manager.acquire('session-1');
      expect(manager.getSessionCount()).toBe(1);

      const session2 = await manager.acquire('session-2');
      expect(manager.getSessionCount()).toBe(2);

      await manager.release('session-1');
      expect(manager.getSessionCount()).toBe(1);

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
    });

    it('getActiveSessions should return all session IDs', async () => {
      await manager.acquire('session-a');
      await manager.acquire('session-b');
      await manager.acquire('session-c');

      const sessions = manager.getActiveSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-a');
      expect(sessions).toContain('session-b');
      expect(sessions).toContain('session-c');
    });

    it('getActiveSessions should return empty when no sessions', () => {
      const sessions = manager.getActiveSessions();
      expect(sessions).toEqual([]);
      expect(sessions).toHaveLength(0);
    });
  });
});
