/**
 * SoulScheduler - Autonomous Agent Scheduler
 *
 * Soul Agent 的统一调度器，负责：
 * - 生命周期管理：激活、休眠、唤醒、清理
 * - 状态管理：维护活跃和休眠的 Soul Agent 实例
 *
 * 心跳调度：
 * - 改用数据库驱动（scheduled_wakeup 字段）
 * - soul-periodic-check cron 负责触发到期的实例
 * - 不再使用内存单例 MinHeap 方案
 *
 * 设计理念：
 * - 类似操作系统的进程调度器，SoulAgent 是调度单元
 * - 数据库持久化，避免 HMR 重置问题
 * - 简化调度器职责，专注于生命周期管理
 */

import { SoulAgent } from '../agent/soul-agent';
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
 * SoulScheduler - Soul Agent 统一调度器
 */
export class SoulScheduler {
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
    // 使用真实的全局对象（不会被 HMR 重置）
    if (!(globalThis as any).__soulSchedulerInstance) {
      (globalThis as any).__soulSchedulerInstance = new SoulScheduler();
      console.log(`[SoulScheduler] ✨ Created new SoulScheduler instance`);
    }
    return (globalThis as any).__soulSchedulerInstance;
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

      // Extract userId from sessionId
      const userId = this.extractUserId(sessionId, soulId);

      // Create soul agent instance
      const soulAgent = new SoulAgent(soulConfig, subagentConfig, sessionId, userId);

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
   * Create new soul instance with task (用于 MyEcho 初始化)
   *
   * 与 activateSoul 的区别：
   * - createSoul：创建新实例，接收 taskId 等额外参数
   * - activateSoul：获取或创建（自动判断），不接收 taskId
   *
   * @param soulId - Soul identifier
   * @param sessionId - Session identifier
   * @param options - Additional options (taskId, userId, characterId, deviceId)
   * @returns SoulAgent instance
   */
  async createSoul(
    soulId: string,
    sessionId: string,
    options: {
      taskId: string;
      userId: string;
      characterId?: string;
      deviceId?: string;
    }
  ): Promise<SoulAgent> {
    console.log(`[SoulScheduler] Creating soul with task: ${soulId}, sessionId: ${sessionId}, taskId: ${options.taskId}`);

    try {
      // Load soul configuration
      const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

      // Load subagent configuration
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

      // Create soul agent instance with taskId
      const soulAgent = new SoulAgent(
        soulConfig,
        subagentConfig,
        sessionId,
        options.userId,
        options.taskId  // ← 传递 taskId
      );

      // Store in active souls
      this.activeSouls.set(sessionId, {
        soulAgent,
        sessionId: soulAgent.getSessionId(),
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      });

      console.log(`[SoulScheduler] Soul created with task: ${sessionId}`);
      console.log(`[SoulScheduler] Active souls count: ${this.activeSouls.size}`);

      return soulAgent;
    } catch (error: any) {
      console.error(`[SoulScheduler] Failed to create soul with task: ${error.message}`);
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
      soulAgent.getSoulState();

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
      // Load soul configuration
      const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

      // Load subagent configuration
      const subagentConfig = await subagentConfigLoader.loadSubagentConfig(soulConfig.subagent);

      // Extract userId from sessionId
      const userId = this.extractUserId(sessionId, soulId);

      // Create soul agent instance
      const soulAgent = new SoulAgent(soulConfig, subagentConfig, sessionId, userId);

      // Wakeup soul (will restore state from database)
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

    this.hibernatedSouls.forEach((hibernatedAt, sessionId) => {
      const hibernationDuration = now - hibernatedAt;

      if (hibernationDuration > maxHibernationTime) {
        console.log(`[SoulScheduler] Cleaning up long-hibernated soul: ${sessionId} (${Math.round(hibernationDuration / (24 * 3600000))} days)`);

        // Remove from hibernated souls
        this.hibernatedSouls.delete(sessionId);

        // TODO: Optionally archive to cold storage or delete from database
        // await getDataStore().archiveSoulState(sessionId);
      }
    });

    if (this.hibernatedSouls.size > 0) {
      console.log(`[SoulScheduler] Cleanup completed. Hibernated souls: ${this.hibernatedSouls.size}`);
    }
  }

  /**
   * Extract user ID from session ID
   *
   * @param sessionId - Session ID (format: soul-{soulId}-{userId})
   * @param soulId - Soul ID (used to correctly extract userId)
   * @returns User ID
   */
  private extractUserId(sessionId: string, soulId: string): string {
    // Remove 'soul-' prefix and soulId to get userId
    const prefix = `soul-${soulId}-`;
    if (sessionId.startsWith(prefix)) {
      return sessionId.substring(prefix.length);
    }
    // Fallback: return sessionId as-is
    return sessionId;
  }

  /**
   * Shutdown scheduler
   *
   * Hibernate all active souls before shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[SoulScheduler] Shutting down...');

    // Stop cleanup interval FIRST to prevent new operations
    this.stopCleanupInterval();

    const hibernatePromises: Promise<void>[] = [];

    // Hibernate all active souls
    this.activeSouls.forEach((instance, sessionId) => {
      console.log(`[SoulScheduler] Hibernating soul before shutdown: ${sessionId}`);
      hibernatePromises.push(this.hibernateSoul(instance.soulAgent));
    });

    await Promise.allSettled(hibernatePromises);

    console.log('[SoulScheduler] Shutdown completed');
  }
}

// Export singleton instance
export const soulScheduler = SoulScheduler.getInstance();
