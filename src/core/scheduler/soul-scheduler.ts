/**
 * SoulScheduler - Autonomous Agent Scheduler
 *
 * Manages Soul lifecycle:
 * - Activation: Create and initialize soul instances
 * - Hibernation: Remove from memory and save state
 * - Wakeup: Restore from database and resume execution
 * - Cleanup: Clean up long-hibernated souls
 */

import { SoulAgent } from '../agent/soul-agent';
import { SoulState } from '../agent/soul-types';
import { soulConfigLoader } from '../config/soul-config-loader';
import { subagentConfigLoader } from '../config/subagent-config-loader';

/**
 * Scheduler instance manager
 */
interface SoulInstance {
  soulAgent: SoulAgent;
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * SoulScheduler - Manages autonomous soul agent lifecycle
 */
export class SoulScheduler {
  private static instance: SoulScheduler;

  // Active soul instances in memory (sessionId -> instance)
  private activeSouls: Map<string, SoulInstance> = new Map();

  // Hibernated souls reference (sessionId -> hibernation timestamp)
  private hibernatedSouls: Map<string, number> = new Map();

  // Cleanup interval timer
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Singleton pattern
  private constructor() {
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SoulScheduler {
    if (!SoulScheduler.instance) {
      SoulScheduler.instance = new SoulScheduler();
    }
    return SoulScheduler.instance;
  }

  /**
   * Activate or get existing soul instance
   *
   * @param soulId - Soul identifier (e.g., "emotional-girlfriend-lively")
   * @param sessionId - Session identifier (e.g., user-specific)
   * @returns SoulAgent instance
   */
  async activateSoul(soulId: string, sessionId: string): Promise<SoulAgent> {
    // Check if soul is already active
    const existing = this.activeSouls.get(sessionId);
    if (existing) {
      console.log(`[SoulScheduler] Soul already active: ${sessionId}`);
      existing.lastActivityAt = Date.now();
      existing.soulAgent.updateLastActivity();
      return existing.soulAgent;
    }

    // Check if soul is hibernated
    if (this.hibernatedSouls.has(sessionId)) {
      console.log(`[SoulScheduler] Waking up hibernated soul: ${sessionId}`);
      return await this.wakeupSoul(soulId, sessionId);
    }

    // Create new soul instance
    console.log(`[SoulScheduler] Creating new soul instance: ${soulId} for session ${sessionId}`);

    try {
      // Load soul configuration
      const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

      // Load subagent configuration
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

      // Create soul agent instance
      const soulAgent = new SoulAgent(soulConfig, subagentConfig, sessionId);

      // Store in active souls
      this.activeSouls.set(sessionId, {
        soulAgent,
        sessionId: soulAgent.getSessionId(),
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      });

      console.log(`[SoulScheduler] Soul activated: ${sessionId}`);
      console.log(`[SoulScheduler] Active souls count: ${this.activeSouls.size}`);

      return soulAgent;
    } catch (error: any) {
      console.error(`[SoulScheduler] Failed to activate soul: ${error.message}`);
      throw error;
    }
  }

  /**
   * Hibernate soul instance
   *
   * @param soulAgent - SoulAgent instance to hibernate
   */
  async hibernateSoul(soulAgent: SoulAgent): Promise<void> {
    const sessionId = soulAgent.getSessionId();

    console.log(`[SoulScheduler] Hibernating soul: ${sessionId}`);

    try {
      // Tell soul agent to enter hibernation
      await soulAgent.enterHibernation('Scheduled hibernation');

      // Get soul state
      const soulState = soulAgent.getSoulState();

      // TODO: Save state to database
      // await getDataStore().saveSoulState(sessionId, soulState);

      // Remove from active souls
      this.activeSouls.delete(sessionId);

      // Add to hibernated souls
      this.hibernatedSouls.set(sessionId, Date.now());

      console.log(`[SoulScheduler] Soul hibernated: ${sessionId}`);
      console.log(`[SoulScheduler] Active souls count: ${this.activeSouls.size}`);
      console.log(`[SoulScheduler] Hibernated souls count: ${this.hibernatedSouls.size}`);
    } catch (error: any) {
      console.error(`[SoulScheduler] Failed to hibernate soul: ${error.message}`);
      throw error;
    }
  }

  /**
   * Wakeup hibernated soul
   *
   * @param soulId - Soul identifier
   * @param sessionId - Session identifier
   * @returns SoulAgent instance
   */
  private async wakeupSoul(soulId: string, sessionId: string): Promise<SoulAgent> {
    console.log(`[SoulScheduler] Waking up soul: ${sessionId}`);

    try {
      // TODO: Load state from database
      // const soulState = await getDataStore().getSoulState(sessionId);

      // Load soul configuration
      const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

      // Load subagent configuration
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

      // Create soul agent instance
      const soulAgent = new SoulAgent(soulConfig, subagentConfig, sessionId);

      // TODO: Restore state
      // soulAgent.restoreState(soulState);

      // Wakeup soul
      await soulAgent.wakeup();

      // Remove from hibernated souls
      this.hibernatedSouls.delete(sessionId);

      // Add to active souls
      this.activeSouls.set(sessionId, {
        soulAgent,
        sessionId: soulAgent.getSessionId(),
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      });

      console.log(`[SoulScheduler] Soul woken up: ${sessionId}`);
      console.log(`[SoulScheduler] Active souls count: ${this.activeSouls.size}`);
      console.log(`[SoulScheduler] Hibernated souls count: ${this.hibernatedSouls.size}`);

      return soulAgent;
    } catch (error: any) {
      console.error(`[SoulScheduler] Failed to wakeup soul: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active soul instance
   *
   * @param sessionId - Session identifier
   * @returns SoulAgent instance or undefined if not active
   */
  getActiveSoul(sessionId: string): SoulAgent | undefined {
    const instance = this.activeSouls.get(sessionId);
    return instance?.soulAgent;
  }

  /**
   * Check if soul is active
   *
   * @param sessionId - Session identifier
   * @returns Whether soul is active
   */
  isSoulActive(sessionId: string): boolean {
    return this.activeSouls.has(sessionId);
  }

  /**
   * Check if soul is hibernated
   *
   * @param sessionId - Session identifier
   * @returns Whether soul is hibernated
   */
  isSoulHibernated(sessionId: string): boolean {
    return this.hibernatedSouls.has(sessionId);
  }

  /**
   * Get scheduler statistics
   *
   * @returns Statistics object
   */
  getStats(): {
    activeSouls: number;
    hibernatedSouls: number;
    totalSouls: number;
  } {
    return {
      activeSouls: this.activeSouls.size,
      hibernatedSouls: this.hibernatedSouls.size,
      totalSouls: this.activeSouls.size + this.hibernatedSouls.size
    };
  }

  /**
   * Start cleanup interval
   *
   * Runs every hour to clean up long-hibernated souls
   */
  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupLongHibernatedSouls();
    }, 3600000); // 1 hour

    console.log('[SoulScheduler] Cleanup interval started (runs every hour)');
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[SoulScheduler] Cleanup interval stopped');
    }
  }

  /**
   * Cleanup long-hibernated souls
   *
   * Removes souls that have been hibernated for more than 7 days
   */
  private cleanupLongHibernatedSouls(): void {
    const now = Date.now();
    const maxHibernationTime = 7 * 24 * 3600000; // 7 days

    for (const [sessionId, hibernatedAt] of this.hibernatedSouls.entries()) {
      const hibernationDuration = now - hibernatedAt;

      if (hibernationDuration > maxHibernationTime) {
        console.log(`[SoulScheduler] Cleaning up long-hibernated soul: ${sessionId} (${Math.round(hibernationDuration / (24 * 3600000))} days)`);

        // Remove from hibernated souls
        this.hibernatedSouls.delete(sessionId);

        // TODO: Optionally archive to cold storage or delete from database
        // await getDataStore().archiveSoulState(sessionId);
      }
    }

    if (this.hibernatedSouls.size > 0) {
      console.log(`[SoulScheduler] Cleanup completed. Hibernated souls: ${this.hibernatedSouls.size}`);
    }
  }

  /**
   * Shutdown scheduler
   *
   * Hibernate all active souls before shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[SoulScheduler] Shutting down...');

    const hibernatePromises: Promise<void>[] = [];

    // Hibernate all active souls
    for (const [sessionId, instance] of this.activeSouls.entries()) {
      console.log(`[SoulScheduler] Hibernating soul before shutdown: ${sessionId}`);
      hibernatePromises.push(this.hibernateSoul(instance.soulAgent));
    }

    await Promise.all(hibernatePromises);

    // Stop cleanup interval
    this.stopCleanupInterval();

    console.log('[SoulScheduler] Shutdown completed');
  }
}

// Export singleton instance
export const soulScheduler = SoulScheduler.getInstance();
