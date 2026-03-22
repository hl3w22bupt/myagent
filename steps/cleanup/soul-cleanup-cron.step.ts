/**
 * Soul Cleanup Cron Step
 *
 * Automatically cleans up stopped Soul Agent instances that have been inactive for over 12 hours.
 * Runs every hour to keep the database clean.
 *
 * Schedule: Every hour at minute 0
 * Cron expression: 0 * * * *
 */

import { soulCleanupService } from '../../src/core/cleanup/soul-cleanup-service';

/**
 * Step configuration
 */
export const config = {
  type: 'cron',
  cron: '0 * * * *', // Every hour at minute 0
  name: 'soul-cleanup-cron',
  description: 'Cleanup stopped Soul Agent instances older than 12 hours',
  emits: [], // No events emitted
};

/**
 * Cron handler
 */
export default async function soulCleanupCron() {
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
