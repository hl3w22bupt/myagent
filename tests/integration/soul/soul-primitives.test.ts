/**
 * Integration tests for Soul Agent primitives
 *
 * Tests send_notification primitive.
 *
 * NOTE: The schedule primitive was removed in the Contractor pattern refactoring.
 * Periodic checks are now driven by external cron (soul-periodic-check) rather
 * than an in-agent scheduleNext method. Schedule-related tests are skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { soulScheduler } from '@/core/scheduler/soul-scheduler';
import { SoulConfig } from '@/core/agent/soul-types';
import { soulConfigLoader } from '@/core/config/soul-config-loader';
import { soulNotificationDataService } from '@/core/database/soul-notification-service';
import { soulStateDataService } from '@/core/database/soul-data-service';
import { getDataStore } from '@/core/database/data-store';
import { SoulState } from '@/core/agent/soul-types';

describe('Soul Agent Primitives Integration', () => {
  const testSoulId = 'emotional-girlfriend-lively';
  const testUserId = 'primitive-test-user';
  const testSessionId = `soul-${testSoulId}-${testUserId}`;

  beforeAll(async () => {
    // Ensure database is initialized
    const store = getDataStore();
    await store.initialize();

    // Create test soul state
    const testState: SoulState = {
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

    await soulStateDataService.saveSoulState(testSessionId, testSoulId, testState);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await soulStateDataService.deleteSoulState(testSessionId);
    } catch {
      // Ignore cleanup errors
    }
    // Shutdown scheduler to clear cleanup interval and hibernate souls
    await soulScheduler.shutdown();
  });

  describe('send_notification primitive', () => {
    it('should send notification through SoulAgent', async () => {
      // Activate soul
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      // Simulate primitive call
      const notificationArgs = {
        title: '测试通知',
        body: '这是一条测试通知',
        urgency: 'high' as const
      };

      // Access private method through reflection (for testing only)
      // In real usage, LLM would call this through tool execution
      const result = await (soulAgent as any).sendNotification(notificationArgs);

      expect(result.success).toBe(true);
      expect(result.notificationId).toMatch(/^notification-/);
      expect(result.title).toBe('测试通知');
      expect(result.body).toBe('这是一条测试通知');

      // Verify notification was created in database
      const notification = await soulNotificationDataService.getNotification(result.notificationId);

      expect(notification).toBeDefined();
      expect(notification?.title).toBe('测试通知');
      expect(notification?.body).toBe('这是一条测试通知');
      expect(notification?.urgency).toBe('high');
      expect(notification?.status).toBe('sent'); // Auto-marked as sent
    });

    it('should handle notification errors gracefully', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      // This should still succeed, but errors would be logged
      const result = await (soulAgent as any).sendNotification({
        title: 'Error Test',
        body: 'Testing error handling',
        urgency: 'low' as const
      });

      expect(result.success).toBe(true);
      expect(result.notificationId).toBeDefined();
    });

    it('should extract userId from sessionId correctly', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const result = await (soulAgent as any).sendNotification({
        title: 'User ID Test',
        body: 'Testing user ID extraction',
        urgency: 'medium' as const
      });

      const notification = await soulNotificationDataService.getNotification(result.notificationId);

      expect(notification?.userId).toBe(testUserId);
    });
  });

  // Schedule primitive removed in Contractor pattern refactoring.
  // Periodic checks are now driven by external cron (soul-periodic-check),
  // not by an in-agent scheduleNext() method.
  describe.skip('schedule primitive (removed in Contractor pattern)', () => {
    it('should schedule wakeup with delay', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const delay = 60000; // 1 minute
      const result = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'delay',
          delay
        }
      });

      expect(result.success).toBe(true);
      expect(result.scheduledWakeup).toBeDefined();
      expect(result.scheduledWakeup).toBeGreaterThanOrEqual(Date.now() + delay - 1000); // Allow 1s tolerance
      expect(result.scheduledWakeup).toBeLessThanOrEqual(Date.now() + delay + 1000);

      // Verify soul state was updated
      const soulState = await soulStateDataService.getSoulState(testSessionId);

      expect(soulState?.scheduledWakeup).toBe(result.scheduledWakeup);
    });

    it('should schedule wakeup with timestamp', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const scheduledTime = Date.now() + 120000; // 2 minutes from now
      const result = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'timestamp',
          timestamp: scheduledTime
        }
      });

      expect(result.success).toBe(true);
      expect(result.scheduledWakeup).toBe(scheduledTime);
      expect(result.scheduledAt).toBe(new Date(scheduledTime).toISOString());

      // Verify soul state was updated
      const soulState = await soulStateDataService.getSoulState(testSessionId);

      expect(soulState?.scheduledWakeup).toBe(scheduledTime);
    });

    it('should schedule wakeup with cron (next_timestamp required)', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const nextTimestamp = Date.now() + 180000; // 3 minutes from now
      const result = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'cron',
          cron: '0 9 * * *', // Daily at 9am
          next_timestamp: nextTimestamp
        }
      });

      expect(result.success).toBe(true);
      expect(result.scheduledWakeup).toBe(nextTimestamp);

      // Verify soul state was updated
      const soulState = await soulStateDataService.getSoulState(testSessionId);

      expect(soulState?.scheduledWakeup).toBe(nextTimestamp);
    });

    it('should handle invalid trigger_config gracefully', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const result = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'invalid'
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing trigger_config gracefully', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const result = await (soulAgent as any).scheduleNext({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('trigger_config is required');
    });

    it('should handle cron without next_timestamp', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      const result = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'cron',
          cron: '0 9 * * *'
          // Missing next_timestamp
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('next_timestamp is required');
    });
  });

  // Skipped: scheduleNext was removed in Contractor pattern.
  // Only send_notification is tested now.
  describe.skip('Integration: Multiple primitives (schedule removed)', () => {
    it('should send notification and schedule wakeup in sequence', async () => {
      const soulAgent = await soulScheduler.activateSoul(testSoulId, testSessionId);

      // 1. Send notification
      const notificationResult = await (soulAgent as any).sendNotification({
        title: 'Scheduled Task',
        body: 'Your soul agent has scheduled its next wakeup',
        urgency: 'medium' as const
      });

      expect(notificationResult.success).toBe(true);

      // 2. Schedule next wakeup
      const scheduleResult = await (soulAgent as any).scheduleNext({
        trigger_config: {
          type: 'delay',
          delay: 300000 // 5 minutes
        }
      });

      expect(scheduleResult.success).toBe(true);

      // Verify both operations persisted
      const notification = await soulNotificationDataService.getNotification(notificationResult.notificationId);
      expect(notification?.status).toBe('sent');

      const soulState = await soulStateDataService.getSoulState(testSessionId);
      expect(soulState?.scheduledWakeup).toBeDefined();
      expect(soulState?.scheduledWakeup).toBeGreaterThan(Date.now());
    });
  });
});
