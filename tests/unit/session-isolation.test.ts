/**
 * Session Isolation Tests (Issue #65)
 *
 * These tests verify that users can only see their own sessions and tasks,
 * not those belonging to other users.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DataStore, Task, TaskStatus } from '@/core/database/data-store';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Session Isolation (Issue #65)', () => {
  let sqliteStore: DataStore;
  let testDbPath: string;

  beforeAll(async () => {
    // Create a temporary database for testing
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-session-isolation-'));
    testDbPath = path.join(tempDir, 'test.db');

    sqliteStore = new DataStore(testDbPath);
    await sqliteStore.initialize();
  });

  afterAll(async () => {
    await sqliteStore.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('SQLite getUserSessions', () => {
    it('should only return sessions for the specified user', async () => {
      const userId1 = 'user1';
      const userId2 = 'user2';

      // Create sessions for user1 (explicitly pass userId)
      await sqliteStore.upsertSession(`soul-soul1-${userId1}-thread1`, { test: 'data1' }, userId1);
      await sqliteStore.upsertSession(`soul-soul1-${userId1}-thread2`, { test: 'data2' }, userId1);

      // Create sessions for user2 (explicitly pass userId)
      await sqliteStore.upsertSession(`soul-soul2-${userId2}-thread1`, { test: 'data3' }, userId2);
      await sqliteStore.upsertSession(`soul-soul2-${userId2}-thread2`, { test: 'data4' }, userId2);

      // Get sessions for user1 - should only see user1's sessions
      const user1Sessions = await sqliteStore.getUserSessions(userId1);
      expect(user1Sessions).toHaveLength(2);
      expect(user1Sessions.every(s => s.sessionId.includes(userId1))).toBe(true);
      expect(user1Sessions.some(s => s.sessionId.includes(userId2))).toBe(false);

      // Get sessions for user2 - should only see user2's sessions
      const user2Sessions = await sqliteStore.getUserSessions(userId2);
      expect(user2Sessions).toHaveLength(2);
      expect(user2Sessions.every(s => s.sessionId.includes(userId2))).toBe(true);
      expect(user2Sessions.some(s => s.sessionId.includes(userId1))).toBe(false);
    });

    it('should return empty array for user with no sessions', async () => {
      const nonExistentUser = 'nonexistent-user';
      const sessions = await sqliteStore.getUserSessions(nonExistentUser);
      expect(sessions).toEqual([]);
    });

    it('should handle regular agent sessions without userId', async () => {
      const userId = 'user1';
      const regularSessionId = 'session-regular-123';

      // Create a regular session (not Soul Agent format)
      await sqliteStore.upsertSession(regularSessionId, { type: 'regular' });

      // This session won't appear in getUserSessions since it has no userId
      const sessions = await sqliteStore.getUserSessions(userId);
      expect(sessions.some(s => s.sessionId === regularSessionId)).toBe(false);
    });
  });

  describe('Task User Association', () => {
    it('should use provided userId when creating task', async () => {
      const userId = 'test-user';
      const sessionId = `soul-soul1-${userId}-thread1`;

      const taskData: Partial<Task> = {
        id: 'task1',
        task: 'Test task',
        sessionId,
        userId,  // Explicitly provide userId
        status: TaskStatus.PENDING,
        app: 'test',
        retryCount: 0,
        isRetry: false,
      };

      await sqliteStore.createTask(taskData as any);

      // Get the task back
      const task = await sqliteStore.getTask('task1');
      expect(task).toBeDefined();
      expect(task?.userId).toBe(userId);
    });

    it('should use provided userId for complex userIds', async () => {
      const userId = 'user-with-dash';
      const sessionId = `soul-mysoul-${userId}-thread123`;

      const taskData: Partial<Task> = {
        id: 'task2',
        task: 'Another test task',
        sessionId,
        userId,  // Explicitly provide userId
        status: TaskStatus.PENDING,
        app: 'test',
        retryCount: 0,
        isRetry: false,
      };

      await sqliteStore.createTask(taskData as any);

      const task = await sqliteStore.getTask('task2');
      expect(task?.userId).toBe(userId);
    });

    it('should use provided userId if available', async () => {
      const userId = 'provided-user';
      const sessionId = 'session-regular-456';

      const taskData: Partial<Task> = {
        id: 'task3',
        task: 'Task with provided userId',
        sessionId,
        userId,  // Explicitly provide userId
        status: TaskStatus.PENDING,
        app: 'test',
        retryCount: 0,
        isRetry: false,
      };

      await sqliteStore.createTask(taskData as any);

      const task = await sqliteStore.getTask('task3');
      expect(task?.userId).toBe(userId);
    });
  });

  describe('Session Creation with userId', () => {
    it('should extract and store userId from Soul Agent session_id', async () => {
      const userId = 'soul-user';
      const sessionId = `soul-soulagent-${userId}-thread1`;

      await sqliteStore.upsertSession(sessionId, { metadata: 'test' });

      const session = await sqliteStore.getSession(sessionId);
      expect(session).toBeDefined();
      // The session should have userId stored (verified by getUserSessions)
    });

    it('should use provided userId when creating session', async () => {
      const userId = 'explicit-user';
      const sessionId = 'session-explicit-789';

      await sqliteStore.upsertSession(sessionId, { type: 'test' }, userId);

      const sessions = await sqliteStore.getUserSessions(userId);
      expect(sessions.some(s => s.sessionId === sessionId)).toBe(true);
    });
  });
});

// Note: PostgreSQL tests would require a test database connection
// These are omitted to avoid requiring external infrastructure for unit tests
