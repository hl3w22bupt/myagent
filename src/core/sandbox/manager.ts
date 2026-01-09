/**
 * SandboxManager - Framework-agnostic manager for Sandbox sessions.
 *
 * Manages session → Sandbox mapping with:
 * - Session isolation (each session has independent Sandbox instance)
 * - State management (Sandbox maintains execution state, variables)
 * - Concurrent safety (different sessions are completely isolated)
 * - Automatic cleanup (expired sessions are removed)
 *
 * This is NOT tied to Motia - can be used in any framework.
 */

import { SandboxAdapter } from './types';
import { SandboxFactory } from './factory';
import { SandboxAdapterConfig } from './types';

/**
 * Configuration for SandboxManager.
 */
export interface SandboxManagerConfig {
  /** Session timeout in milliseconds */
  sessionTimeout: number;

  /** Maximum number of sessions */
  maxSessions: number;

  /** Sandbox configuration for creating new Sandboxes */
  sandboxConfig: SandboxAdapterConfig;
}

/**
 * Manages multiple Sandbox sessions.
 *
 * Provides session lifecycle management:
 * - acquire(): Get or create Sandbox for session
 * - release(): Release session and cleanup resources
 * - shutdown(): Cleanup all sessions
 *
 * Automatically handles:
 * - Session expiration and cleanup
 * - Session limit enforcement (evicts oldest when full)
 */
export class SandboxManager {
  private sessions: Map<string, SandboxAdapter> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private config: SandboxManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: SandboxManagerConfig) {
    this.config = config;

    // Periodic cleanup of expired sessions (every minute)
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * Get or create Sandbox for a session.
   *
   * If session exists, updates activity time and returns existing Sandbox.
   * If session doesn't exist, creates new Sandbox instance.
   *
   * @param sessionId - Session identifier
   * @returns Sandbox instance for this session
   */
  async acquire(sessionId: string): Promise<SandboxAdapter> {
    // Session exists - return existing Sandbox
    if (this.sessions.has(sessionId)) {
      const sandbox = this.sessions.get(sessionId)!;
      this.lastActivity.set(sessionId, Date.now());
      return sandbox;
    }

    // Create new Sandbox instance
    const sandbox = SandboxFactory.create(this.config.sandboxConfig);

    this.sessions.set(sessionId, sandbox);
    this.lastActivity.set(sessionId, Date.now());

    // Enforce session limit
    if (this.sessions.size > this.config.maxSessions) {
      await this.evictOldestSession();
    }

    return sandbox;
  }

  /**
   * Release a session and cleanup resources.
   *
   * @param sessionId - Session identifier
   */
  async release(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      const sandbox = this.sessions.get(sessionId)!;

      try {
        await sandbox.cleanup(sessionId);
      } catch (error) {
        console.error(`Error cleaning up sandbox session ${sessionId}:`, error);
      }

      this.sessions.delete(sessionId);
      this.lastActivity.delete(sessionId);
    }
  }

  /**
   * Cleanup expired sessions.
   *
   * Removes sessions that haven't been used within sessionTimeout.
   * Called automatically every minute.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    // Find expired sessions
    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (now - lastActivity > this.config.sessionTimeout) {
        expired.push(sessionId);
      }
    }

    // Release expired sessions
    for (const sessionId of expired) {
      await this.release(sessionId);
      console.log(`Cleaned up expired sandbox session: ${sessionId}`);
    }
  }

  /**
   * Evict the oldest session (LRU eviction).
   *
   * Called when session limit is exceeded.
   */
  private async evictOldestSession(): Promise<void> {
    let oldestSession: string | null = null;
    let oldestTime = Infinity;

    // Find oldest session
    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestSession = sessionId;
      }
    }

    if (oldestSession) {
      await this.release(oldestSession);
      console.log(`Evicted oldest sandbox session: ${oldestSession}`);
    }
  }

  /**
   * Shutdown the manager and cleanup all sessions.
   */
  async shutdown(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Release all sessions
    await Promise.all(
      Array.from(this.sessions.keys()).map(id => this.release(id))
    );
  }

  /**
   * Get current session count.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active session IDs.
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
