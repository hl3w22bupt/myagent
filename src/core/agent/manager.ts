/**
 * AgentManager - Framework-agnostic manager for Agent sessions.
 *
 * Manages session → Agent mapping with:
 * - Session isolation (each session has independent Agent instance)
 * - State management (Agent maintains conversation history, variables)
 * - Concurrent safety (different sessions are completely isolated)
 * - Automatic cleanup (expired sessions are removed)
 *
 * This is NOT tied to Motia - can be used in any framework.
 */

import { Agent } from './agent';
import { AgentConfig } from './types';

/**
 * Configuration for AgentManager.
 */
export interface AgentManagerConfig {
  /** Session timeout in milliseconds */
  sessionTimeout: number;

  /** Maximum number of sessions */
  maxSessions: number;

  /** Agent configuration for creating new Agents */
  agentConfig: AgentConfig;
}

/**
 * Manages multiple Agent sessions.
 *
 * Provides session lifecycle management:
 * - acquire(): Get or create Agent for session
 * - release(): Release session and cleanup resources
 * - shutdown(): Cleanup all sessions
 *
 * Automatically handles:
 * - Session expiration and cleanup
 * - Session limit enforcement (evicts oldest when full)
 */
export class AgentManager {
  private sessions: Map<string, Agent> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private config: AgentManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: AgentManagerConfig) {
    this.config = config;

    // Periodic cleanup of expired sessions (every minute)
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * Get or create Agent for a session.
   *
   * If session exists, updates activity time and returns existing Agent.
   * If session doesn't exist, creates new Agent with session state.
   *
   * @param sessionId - Session identifier
   * @returns Agent instance for this session
   */
  async acquire(sessionId: string): Promise<Agent> {
    // Session exists - return existing Agent
    if (this.sessions.has(sessionId)) {
      const agent = this.sessions.get(sessionId)!;
      this.lastActivity.set(sessionId, Date.now());
      return agent;
    }

    // Create new Agent with session state
    // Now passing sessionId to Agent constructor (Task 5.4)
    const agent = new Agent(this.config.agentConfig, sessionId);

    this.sessions.set(sessionId, agent);
    this.lastActivity.set(sessionId, Date.now());

    // Enforce session limit
    if (this.sessions.size > this.config.maxSessions) {
      await this.evictOldestSession();
    }

    return agent;
  }

  /**
   * Release a session and cleanup resources.
   *
   * @param sessionId - Session identifier
   */
  async release(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      const agent = this.sessions.get(sessionId)!;

      try {
        await agent.cleanup();
      } catch (error) {
        console.error(`Error cleaning up session ${sessionId}:`, error);
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
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.release(id)));
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
