/**
 * Unit tests for Soul Notification Service
 *
 * Tests notification creation, retrieval, and status updates
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { soulNotificationDataService } from '@/core/database/soul-notification-service';
import { soulStateDataService } from '@/core/database/soul-data-service';
import { getDataStore } from '@/core/database/data-store';
import { SoulState } from '@/core/agent/soul-types';

describe('Soul Notification Service', () => {
  const testSessionId = 'test-notification-session';
  const testUserId = 'test-notification-user';
  const testSoulId = 'emotional-girlfriend-lively';

  beforeAll(async () => {
    // Ensure database is initialized
    const store = getDataStore();
    await store.initialize();

    // Create test soul state (required for foreign key constraint)
    const testState: SoulState = {
      status: 'ACTIVE',
      currentTask: null,
      lastActivity: Date.now(),
      scheduledWakeup: null,
      statistics: {
        totalTasks: 0,
        uptime: 0
      }
    };

    await soulStateDataService.saveSoulState(testSessionId, testSoulId, testState);
  });

  afterAll(async () => {
    // Cleanup test soul state (notifications will be cascade deleted)
    try {
      await soulStateDataService.deleteSoulState(testSessionId);
    } catch (error) {
      // Ignore if doesn't exist
    }
  });

  describe('createNotification', () => {
    it('should create notification with all parameters', async () => {
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Test Notification',
        'This is a test notification',
        'high'
      );

      expect(notification).toBeDefined();
      expect(notification.id).toMatch(/^notification-/);
      expect(notification.sessionId).toBe(testSessionId);
      expect(notification.soulId).toBe(testSoulId);
      expect(notification.userId).toBe(testUserId);
      expect(notification.title).toBe('Test Notification');
      expect(notification.body).toBe('This is a test notification');
      expect(notification.urgency).toBe('high');
      expect(notification.status).toBe('pending');
    });

    it('should create notification with default urgency', async () => {
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Default Urgency',
        'Testing default urgency'
      );

      expect(notification.urgency).toBe('medium');
    });
  });

  describe('getNotification', () => {
    it('should get notification by ID', async () => {
      const created = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Get Test',
        'Testing get notification'
      );

      const retrieved = await soulNotificationDataService.getNotification(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Get Test');
    });

    it('should return null for non-existent notification', async () => {
      const retrieved = await soulNotificationDataService.getNotification('non-existent-notification');
      expect(retrieved).toBeNull();
    });
  });

  describe('getPendingNotifications', () => {
    it('should get pending notifications for user', async () => {
      // Create multiple pending notifications
      await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Pending 1',
        'First pending'
      );

      await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Pending 2',
        'Second pending'
      );

      const pending = await soulNotificationDataService.getPendingNotifications(testUserId);

      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every(n => n.status === 'pending')).toBe(true);
    });

    it('should return empty array for user with no pending notifications', async () => {
      const pending = await soulNotificationDataService.getPendingNotifications('non-existent-user');
      expect(pending).toEqual([]);
    });
  });

  describe('updateNotificationStatus', () => {
    it('should update notification status to sent', async () => {
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Status Test',
        'Testing status update'
      );

      await soulNotificationDataService.updateNotificationStatus(notification.id, 'sent');

      const updated = await soulNotificationDataService.getNotification(notification.id);

      expect(updated?.status).toBe('sent');
      expect(updated?.sentAt).toBeInstanceOf(Date);
    });

    it('should update notification status to delivered', async () => {
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Delivery Test',
        'Testing delivery'
      );

      await soulNotificationDataService.updateNotificationStatus(notification.id, 'delivered');

      const updated = await soulNotificationDataService.getNotification(notification.id);

      expect(updated?.status).toBe('delivered');
      expect(updated?.deliveredAt).toBeInstanceOf(Date);
    });

    it('should update notification status to failed with error message', async () => {
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Failure Test',
        'Testing failure'
      );

      await soulNotificationDataService.updateNotificationStatus(
        notification.id,
        'failed',
        'Device token not found'
      );

      const updated = await soulNotificationDataService.getNotification(notification.id);

      expect(updated?.status).toBe('failed');
      expect(updated?.errorMessage).toBe('Device token not found');
    });
  });

  describe('getRecentNotifications', () => {
    it('should get recent notifications for session', async () => {
      // Create multiple notifications
      await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Recent 1',
        'First recent'
      );

      await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Recent 2',
        'Second recent'
      );

      const recent = await soulNotificationDataService.getRecentNotifications(testSessionId, 5);

      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].sessionId).toBe(testSessionId);
    });

    it('should limit recent notifications', async () => {
      const recent = await soulNotificationDataService.getRecentNotifications(testSessionId, 2);

      expect(recent.length).toBeLessThanOrEqual(2);
    });

    it('should return notifications in descending order by created_at', async () => {
      const recent = await soulNotificationDataService.getRecentNotifications(testSessionId, 10);

      for (let i = 0; i < recent.length - 1; i++) {
        expect(recent[i].createdAt.getTime()).toBeGreaterThanOrEqual(recent[i + 1].createdAt.getTime());
      }
    });
  });

  describe('Integration: Notification Lifecycle', () => {
    it('should handle complete notification lifecycle', async () => {
      // 1. Create notification
      const notification = await soulNotificationDataService.createNotification(
        testSessionId,
        testSoulId,
        testUserId,
        'Lifecycle Test',
        'Testing complete lifecycle',
        'high'
      );

      expect(notification.status).toBe('pending');

      // 2. Mark as sent
      await soulNotificationDataService.updateNotificationStatus(notification.id, 'sent');
      let updated = await soulNotificationDataService.getNotification(notification.id);
      expect(updated?.status).toBe('sent');
      expect(updated?.sentAt).toBeDefined();

      // 3. Mark as delivered
      await soulNotificationDataService.updateNotificationStatus(notification.id, 'delivered');
      updated = await soulNotificationDataService.getNotification(notification.id);
      expect(updated?.status).toBe('delivered');
      expect(updated?.deliveredAt).toBeDefined();

      // 4. Verify in recent notifications
      const recent = await soulNotificationDataService.getRecentNotifications(testSessionId, 10);
      const found = recent.find(n => n.id === notification.id);
      expect(found).toBeDefined();
    });
  });
});
