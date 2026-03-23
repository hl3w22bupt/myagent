/**
 * Soul Cleanup Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { SoulCleanupService } from '../../../src/core/cleanup/soul-cleanup-service';
import { PostgresDataStore } from '../../../src/core/database/postgres-store';

describe('SoulCleanupService', () => {
  let store: PostgresDataStore;
  let cleanupService: SoulCleanupService;
  let pool: any;

  beforeAll(async () => {
    store = new PostgresDataStore();
    await store.initialize();
    pool = store.getPool();
  });

  afterAll(async () => {
    // Cleanup will be handled by Jest teardown
  });

  beforeEach(async () => {
    cleanupService = new SoulCleanupService({ maxStoppedDuration: 12 * 3600000 });
  });

  describe('cleanupStoppedInstances', () => {
    it('should find instances stopped > 12 hours', async () => {
      const client = await pool.connect();

      try {
        // Create test data
        const now = new Date();
        const stopped13HoursAgo = new Date(now.getTime() - 13 * 3600000);
        const stopped11HoursAgo = new Date(now.getTime() - 11 * 3600000);

        // Insert 2 instances: one > 12h, one < 12h
        await client.query(`
          INSERT INTO soul_states (session_id, soul_id, status, last_activity, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP),
                 ($5, $6, $7, $8, CURRENT_TIMESTAMP)
        `, [
          'test-session-old', 'test-soul', 'STOPPED', stopped13HoursAgo,
          'test-session-new', 'test-soul', 'STOPPED', stopped11HoursAgo,
        ]);

        // Run cleanup
        const result = await cleanupService.cleanupStoppedInstances();

        // Verify only old instance was deleted
        expect(result.deletedCount).toBe(1);
        expect(result.sessionIds).toContain('test-session-old');
        expect(result.sessionIds).not.toContain('test-session-new');

        // Verify database state
        const checkResult = await client.query(`
          SELECT session_id FROM soul_states WHERE session_id IN ($1, $2)
        `, ['test-session-old', 'test-session-new']);

        expect(checkResult.rows.length).toBe(1);
        expect(checkResult.rows[0].session_id).toBe('test-session-new');
      } finally {
        // Cleanup
        await client.query('DELETE FROM soul_states WHERE session_id LIKE $1', ['test-session-%']);
        client.release();
      }
    });

    it('should cascade delete related tables', async () => {
      const client = await pool.connect();

      try {
        const now = new Date();
        const stopped13HoursAgo = new Date(now.getTime() - 13 * 3600000);

        // Insert soul_states
        await client.query(`
          INSERT INTO soul_states (session_id, soul_id, status, last_activity, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, ['test-session-cascade', 'test-soul', 'STOPPED', stopped13HoursAgo]);

        // Insert related data
        await client.query(`
          INSERT INTO soul_contexts (session_id, user_id, conversation_rounds, updated_at)
          VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
        `, ['test-session-cascade', 'user123', '[]']);

        await client.query(`
          INSERT INTO soul_notifications (id, session_id, soul_id, user_id, created_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, ['notif-1', 'test-session-cascade', 'test-soul', 'user123']);

        // Run cleanup
        const result = await cleanupService.cleanupStoppedInstances();

        expect(result.deletedCount).toBe(1);

        // Verify all related data was deleted
        const stateCheck = await client.query('SELECT * FROM soul_states WHERE session_id = $1', ['test-session-cascade']);
        const contextCheck = await client.query('SELECT * FROM soul_contexts WHERE session_id = $1', ['test-session-cascade']);
        const notificationCheck = await client.query('SELECT * FROM soul_notifications WHERE session_id = $1', ['test-session-cascade']);

        expect(stateCheck.rows.length).toBe(0);
        expect(contextCheck.rows.length).toBe(0);
        expect(notificationCheck.rows.length).toBe(0);
      } finally {
        // Cleanup
        await client.query('DELETE FROM soul_states WHERE session_id LIKE $1', ['test-session-%']);
        await client.query('DELETE FROM soul_contexts WHERE session_id LIKE $1', ['test-session-%']);
        await client.query('DELETE FROM soul_notifications WHERE session_id LIKE $1', ['test-session-%']);
        client.release();
      }
    });

    it('should handle empty results gracefully', async () => {
      // No test data inserted
      const result = await cleanupService.cleanupStoppedInstances();

      expect(result.deletedCount).toBe(0);
      expect(result.sessionIds).toEqual([]);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should only delete STOPPED instances', async () => {
      const client = await pool.connect();

      try {
        const now = new Date();
        const stopped13HoursAgo = new Date(now.getTime() - 13 * 3600000);

        // Insert instances with different statuses
        await client.query(`
          INSERT INTO soul_states (session_id, soul_id, status, last_activity, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP),
                 ($5, $6, $7, $8, CURRENT_TIMESTAMP),
                 ($9, $10, $11, $12, CURRENT_TIMESTAMP)
        `, [
          'test-session-stopped', 'test-soul', 'STOPPED', stopped13HoursAgo,
          'test-session-active', 'test-soul', 'ACTIVE', stopped13HoursAgo,
          'test-session-hibernated', 'test-soul', 'HIBERNATED', stopped13HoursAgo,
        ]);

        // Run cleanup
        const result = await cleanupService.cleanupStoppedInstances();

        // Only STOPPED instance should be deleted
        expect(result.deletedCount).toBe(1);
        expect(result.sessionIds).toContain('test-session-stopped');

        // Verify other statuses remain
        const checkResult = await client.query(`
          SELECT session_id, status FROM soul_states
          WHERE session_id LIKE 'test-session-%'
          ORDER BY session_id
        `);

        expect(checkResult.rows.length).toBe(2);
        expect(checkResult.rows[0].session_id).toBe('test-session-active');
        expect(checkResult.rows[1].session_id).toBe('test-session-hibernated');
      } finally {
        // Cleanup
        await client.query('DELETE FROM soul_states WHERE session_id LIKE $1', ['test-session-%']);
        client.release();
      }
    });
  });
});
