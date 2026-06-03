/**
 * Soul Cleanup Cron Step
 *
 * Automatically cleans up stopped Soul Agent instances that have been inactive for over 1 hour.
 * Runs every 10 minutes to keep the database clean.
 */

import { type StepConfig, cron } from '../../src/iii-bridge.js';
import { soulCleanupService } from '../../src/core/cleanup/soul-cleanup-service.js';

/**
 * Step configuration
 */
export const config = {
  name: 'soul-cleanup-cron',
  description: 'Cleanup stopped Soul Agent instances older than 1 hour',
  triggers: [
    cron('0 0 */10 * * * *'), // Every 10 minutes (7-field format)
  ],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Cron handler
 */
export const handler = async function soulCleanupCron() {
  console.log('========================================');
  console.log('[SoulCleanupCron] Triggered at', new Date().toISOString());
  console.log('========================================');

  try {
    const result = await soulCleanupService.cleanupStoppedInstances();

    // Return result for logging
    return {
      success: true,
      deletedCount: result.deletedCount,
      sessionIds: result.sessionIds,
      duration: result.duration,
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    console.error('[SoulCleanupCron] Error:', error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date(),
    };
  }
}
