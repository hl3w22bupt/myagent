/**
 * Soul Cleanup Service
 *
 * Cleans up stopped Soul Agent instances that have been inactive for too long.
 * Deletes soul_states and cascades to related tables (contexts, notifications, history).
 */

import { PostgresDataStore } from '../database/postgres-store';
import { getDataStore as getDataStore_ } from '../database/data-store';

const getDataStore = getDataStore_;

/**
 * Stopped instance metadata
 */
export interface StoppedInstance {
  sessionId: string;
  soulId: string;
  stoppedAt: Date;
  stoppedDuration: number; // milliseconds
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  deletedCount: number;
  sessionIds: string[];
  duration: number;
  timestamp: Date;
}

/**
 * Configuration for cleanup operation
 */
export interface CleanupConfig {
  maxStoppedDuration: number; // milliseconds, default: 12 hours
}

/**
 * Get cleanup duration from environment variable
 * Format: SOUL_CLEANUP_DURATION_HOURS=1 (for 1 hour)
 * Default: 12 hours
 */
function getCleanupDurationFromEnv(): number {
  const envHours = process.env.SOUL_CLEANUP_DURATION_HOURS;
  if (envHours) {
    const hours = parseFloat(envHours);
    if (!isNaN(hours) && hours > 0) {
      console.log(`[SoulCleanup] Using cleanup duration from env: ${hours} hours`);
      return hours * 3600000;
    }
  }
  return 12 * 3600000; // default: 12 hours
}

/**
 * SoulCleanupService - Cleans up long-stopped Soul Agent instances
 */
export class SoulCleanupService {
  private config: CleanupConfig;

  constructor(config?: Partial<CleanupConfig>) {
    this.config = {
      maxStoppedDuration: config?.maxStoppedDuration || getCleanupDurationFromEnv(),
    };
  }

  /**
   * Cleanup stopped instances
   *
   * Finds and deletes instances with status = STOPPED and last_activity > maxStoppedDuration ago
   */
  async cleanupStoppedInstances(): Promise<CleanupResult> {
    const startTime = Date.now();
    console.log(`[SoulCleanup] Starting cleanup at ${new Date().toISOString()}`);

    const store = new PostgresDataStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      // Find stopped instances
      const instances = await this.findStoppedInstances(client);
      console.log(`[SoulCleanup] Found ${instances.length} stopped instances (> ${this.config.maxStoppedDuration / 3600000}h)`);

      if (instances.length === 0) {
        return {
          deletedCount: 0,
          sessionIds: [],
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      // Delete instances (cascade to related tables via foreign keys)
      await this.deleteInstances(client, instances.map(i => i.sessionId));

      const result: CleanupResult = {
        deletedCount: instances.length,
        sessionIds: instances.map(i => i.sessionId),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      console.log(`[SoulCleanup] Deleted ${result.deletedCount} instances in ${result.duration}ms`);
      console.log(`[SoulCleanup] Session IDs: ${result.sessionIds.join(', ')}`);

      return result;
    } catch (error: any) {
      console.error(`[SoulCleanup] Cleanup failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find stopped instances older than max duration
   */
  private async findStoppedInstances(client: any): Promise<StoppedInstance[]> {
    const query = `
      SELECT session_id, soul_id, last_activity
      FROM soul_states
      WHERE status = 'STOPPED'
        AND last_activity < NOW() - INTERVAL '1 millisecond' * $1
      ORDER BY last_activity ASC
    `;

    const result = await client.query(query, [this.config.maxStoppedDuration]);

    return result.rows.map((row: any) => ({
      sessionId: row.session_id,
      soulId: row.soul_id,
      stoppedAt: new Date(row.last_activity),
      stoppedDuration: Date.now() - new Date(row.last_activity).getTime(),
    }));
  }

  /**
   * Delete instances by session IDs (cascade to related tables)
   */
  private async deleteInstances(client: any, sessionIds: string[]): Promise<void> {
    await client.query('BEGIN');

    try {
      const deleteQuery = `
        DELETE FROM soul_states
        WHERE session_id = ANY($1::text[])
      `;

      await client.query(deleteQuery, [sessionIds]);
      await client.query('COMMIT');

      console.log(`[SoulCleanup] Deleted from soul_states: ${sessionIds.length} records`);
      console.log(`[SoulCleanup] Cascade deleted from related tables (contexts, notifications, history)`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`[SoulCleanup] Delete failed, rolled back: ${error.message}`);
      throw error;
    }
  }
}

// Export singleton instance
export const soulCleanupService = new SoulCleanupService();
