/**
 * AgentManager - Framework-agnostic manager for Agent sessions.
 *
 * Manages session → Agent mapping with:
 * - Session isolation (each session has independent Agent instance)
 * - State management (Agent maintains conversation history, variables)
 * - Concurrent safety (different sessions are completely isolated)
 * - Automatic cleanup (expired sessions are removed)
 * - Agent Hooks (lifecycle hooks for monitoring, state sync, progress notifications)
 *
 * This is NOT tied to Motia - can be used in any framework.
 */

import { Agent } from './agent';
import { MasterAgent } from './master-agent';
import { AgentConfig, MasterAgentConfig } from './types';
import { AgentHookManager } from './hooks/manager';

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

  /** Optional: MasterAgent configuration for delegation */
  masterAgentConfig?: MasterAgentConfig;

  /** Optional: Default agent type ('agent' or 'master') */
  defaultAgentType?: 'agent' | 'master';
}

/**
 * Options for acquiring an agent.
 */
export interface AcquireOptions {
  /** Agent type to create */
  agentType?: 'agent' | 'master';
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
 * - Agent Hook execution during lifecycle events
 */
export class AgentManager {
  private sessions: Map<string, Agent | MasterAgent> = new Map();
  private sessionTypes: Map<string, 'agent' | 'master'> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private config: AgentManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private hookManager: AgentHookManager;

  constructor(config: AgentManagerConfig) {
    this.config = config;
    this.hookManager = new AgentHookManager();

    // Periodic cleanup of expired sessions (every minute)
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * Get the Agent Hook Manager.
   *
   * Use this to register hooks for Agent lifecycle events.
   *
   * @returns AgentHookManager instance
   */
  getHookManager(): AgentHookManager {
    return this.hookManager;
  }

  /**
   * Register an Agent Hook.
   *
   * @param hook - Hook instance to register
   */
  registerHook(hook: any): void {
    this.hookManager.register(hook);
  }

  /**
   * Unregister an Agent Hook.
   *
   * @param hook - Hook instance to unregister
   */
  unregisterHook(hook: any): void {
    this.hookManager.unregister(hook);
  }

  /**
   * Get or create Agent for a session.
   *
   * If session exists, updates activity time and returns existing Agent.
   * If session doesn't exist, creates new Agent with session state.
   *
   * @param sessionId - Session identifier
   * @param options - Optional acquire options (agent type)
   * @returns Agent or MasterAgent instance for this session
   */
  async acquire(
    sessionId: string,
    options?: AcquireOptions
  ): Promise<Agent | MasterAgent> {
    // Session exists - return existing Agent
    if (this.sessions.has(sessionId)) {
      const agent = this.sessions.get(sessionId)!;
      this.lastActivity.set(sessionId, Date.now());

      // Execute onAgentAcquire hook (for reused Agent)
      await this.hookManager.executeHook('onAgentAcquire', agent, sessionId);

      return agent;
    }

    // Determine agent type
    const agentType =
      options?.agentType ||
      this.config.defaultAgentType ||
      'agent';

    // Determine config to use
    const config = agentType === 'master'
      ? this.config.masterAgentConfig!
      : this.config.agentConfig;

    // Execute onAgentCreate hook
    const createResult = await this.hookManager.executeHook<
      { abort?: boolean; reason?: string } | undefined
    >(
      'onAgentCreate',
      config,
      sessionId
    );

    // Check if hook wants to abort creation
    if (createResult?.abort) {
      throw new Error(
        `Agent creation aborted by hook: ${createResult.reason || 'Unknown reason'}`
      );
    }

    // Create new Agent or MasterAgent
    let agent: Agent | MasterAgent;

    if (agentType === 'master') {
      // Validate masterAgentConfig exists
      if (!this.config.masterAgentConfig) {
        throw new Error(
          'Cannot create MasterAgent: masterAgentConfig not provided in AgentManagerConfig'
        );
      }
      agent = new MasterAgent(this.config.masterAgentConfig, sessionId);
    } else {
      // Create regular Agent
      agent = new Agent(this.config.agentConfig, sessionId);
    }

    // Store session and type
    this.sessions.set(sessionId, agent);
    this.sessionTypes.set(sessionId, agentType);
    this.lastActivity.set(sessionId, Date.now());

    // Execute onAgentAcquire hook (for new Agent)
    await this.hookManager.executeHook('onAgentAcquire', agent, sessionId);

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
        // Execute onAgentDestroy hook before cleanup
        await this.hookManager.executeHook('onAgentDestroy', sessionId);

        // Cleanup Agent
        await agent.cleanup();
      } catch (error) {
        console.error(`Error cleaning up session ${sessionId}:`, error);
      }

      this.sessions.delete(sessionId);
      this.sessionTypes.delete(sessionId);
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
