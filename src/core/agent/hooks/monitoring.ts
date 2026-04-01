/**
 * AgentMonitoringHook - Monitors Agent health and performance.
 *
 * Tracks Agent lifecycle events and performance metrics:
 * - Agent creation/acquisition
 * - Task execution metrics
 * - Status checks (stale detection, performance monitoring)
 * - Agent destruction
 *
 * Features:
 * - Metric collection (task counts, execution times, error rates)
 * - Stale Agent detection (agents inactive too long)
 * - Performance logging
 * - Health status tracking
 *
 * Example:
 * ```typescript
 * const monitoringHook = new AgentMonitoringHook({
 *   staleThreshold: 30 * 60 * 1000, // 30 minutes
 *   logMetrics: true
 * });
 * hookManager.register(monitoringHook);
 * ```
 */

import { BaseAgentHook, type Agent } from './base';
import type { AgentConfig, AgentResult } from '../types';

/**
 * Configuration for AgentMonitoringHook.
 */
export interface AgentMonitoringConfig {
  /** Threshold for considering an Agent as stale (milliseconds) */
  staleThreshold?: number;

  /** Whether to log metrics */
  logMetrics?: boolean;

  /** Whether to track performance metrics */
  trackPerformance?: boolean;
}

/**
 * Agent health status.
 */
export interface AgentHealth {
  agentId: string;
  sessionId: string;
  status: 'healthy' | 'stale' | 'error';
  taskCount: number;
  lastActivity: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  errorCount: number;
}

/**
 * Monitoring data for an Agent.
 */
export interface AgentMonitoringData {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  taskCount: number;
  totalExecutionTime: number;
  errorCount: number;
  isMaster: boolean;
}

/**
 * Monitors Agent health and performance metrics.
 */
export class AgentMonitoringHook extends BaseAgentHook {
  private config: Required<AgentMonitoringConfig>;
  private monitoringData: Map<string, AgentMonitoringData> = new Map();
  private healthStatus: Map<string, AgentHealth> = new Map();

  constructor(config: AgentMonitoringConfig = {}) {
    super();
    this.config = {
      staleThreshold: config.staleThreshold || 30 * 60 * 1000, // 30 minutes
      logMetrics: config.logMetrics ?? true,
      trackPerformance: config.trackPerformance ?? true,
    };
  }

  /**
   * Called when Agent is created.
   * Logs creation and initializes monitoring data.
   */
  async onAgentCreate(
    config: AgentConfig,
    sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    if (this.config.logMetrics) {
      console.log('[AgentMonitoringHook] Agent creation requested', {
        sessionId,
        systemPrompt: config.systemPrompt.substring(0, 100),
        skillsCount: config.availableSkills?.length || 0,
      });
    }

    // Don't abort creation
    return undefined;
  }

  /**
   * Called when Agent is acquired (may be reused).
   * Updates last activity timestamp.
   */
  async onAgentAcquire(
    agent: Agent,
    sessionId: string
  ): Promise<void | undefined> {
    // Use sessionId as agentId since Agent doesn't have getId() method
    const agentId = sessionId;
    const now = Date.now();

    if (!this.monitoringData.has(sessionId)) {
      // New Agent
      const data: AgentMonitoringData = {
        sessionId,
        createdAt: now,
        lastActivity: now,
        taskCount: 0,
        totalExecutionTime: 0,
        errorCount: 0,
        isMaster: agent.constructor.name === 'MasterAgent',
      };
      this.monitoringData.set(sessionId, data);

      if (this.config.logMetrics) {
        console.log('[AgentMonitoringHook] Agent acquired (new)', {
          sessionId,
          agentId,
          isMaster: data.isMaster,
        });
      }
    } else {
      // Existing Agent
      const data = this.monitoringData.get(sessionId)!;
      data.lastActivity = now;

      if (this.config.logMetrics) {
        console.log('[AgentMonitoringHook] Agent acquired (reused)', {
          sessionId,
          agentId,
          taskCount: data.taskCount,
          age: now - data.createdAt,
        });
      }
    }

    // Update health status
    this.updateHealthStatus(sessionId);
  }

  /**
   * Called before task execution.
   * Logs task start.
   */
  async onTaskStart(
    task: string,
    taskId: string,
    context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    if (this.config.logMetrics) {
      console.log('[AgentMonitoringHook] Task starting', {
        taskId,
        task: task.substring(0, 100),
        sessionId: context.sessionId,
      });
    }

    // Don't modify task
    return undefined;
  }

  /**
   * Called after task execution completes.
   * Collects performance metrics.
   */
  async onTaskComplete(
    result: AgentResult,
    context: any
  ): Promise<void | undefined> {
    const sessionId = context.sessionId;
    const data = this.monitoringData.get(sessionId);

    if (!data) {
      console.warn('[AgentMonitoringHook] No monitoring data for session', { sessionId });
      return;
    }

    // Update metrics
    data.taskCount++;
    data.lastActivity = Date.now();

    if (result.success) {
      data.totalExecutionTime += result.executionTime;
    } else {
      data.errorCount++;
    }

    // Calculate average execution time
    const avgExecutionTime = data.taskCount > 0
      ? data.totalExecutionTime / data.taskCount
      : 0;

    if (this.config.logMetrics) {
      console.log('[AgentMonitoringHook] Task completed', {
        sessionId,
        taskId: context.taskId,
        success: result.success,
        executionTime: result.executionTime,
        taskCount: data.taskCount,
        averageExecutionTime: avgExecutionTime.toFixed(2) + 'ms',
        errorCount: data.errorCount,
      });
    }

    // Update health status
    this.updateHealthStatus(sessionId);
  }

  /**
   * Called periodically to check Agent status.
   * Detects stale agents and logs health status.
   */
  async onAgentStatusCheck(agent: Agent): Promise<void | undefined> {
    const sessionId = agent.getSessionId();
    const data = this.monitoringData.get(sessionId);

    if (!data) {
      return;
    }

    const now = Date.now();
    const inactiveTime = now - data.lastActivity;

    // Check if Agent is stale
    const isStale = inactiveTime > this.config.staleThreshold;

    if (isStale && this.config.logMetrics) {
      console.warn('[AgentMonitoringHook] Stale Agent detected', {
        sessionId,
        inactiveTime: Math.round(inactiveTime / 1000) + 's',
        threshold: Math.round(this.config.staleThreshold / 1000) + 's',
        taskCount: data.taskCount,
      });
    }

    // Update health status
    this.updateHealthStatus(sessionId);
  }

  /**
   * Called before Agent is destroyed.
   * Logs final metrics and cleans up monitoring data.
   */
  async onAgentDestroy(sessionId: string): Promise<void | undefined> {
    const data = this.monitoringData.get(sessionId);

    if (!data) {
      return;
    }

    const lifetime = Date.now() - data.createdAt;
    const avgExecutionTime = data.taskCount > 0
      ? data.totalExecutionTime / data.taskCount
      : 0;

    if (this.config.logMetrics) {
      console.log('[AgentMonitoringHook] Agent destroyed', {
        sessionId,
        lifetime: Math.round(lifetime / 1000) + 's',
        taskCount: data.taskCount,
        totalExecutionTime: Math.round(data.totalExecutionTime) + 'ms',
        averageExecutionTime: avgExecutionTime.toFixed(2) + 'ms',
        errorCount: data.errorCount,
        isMaster: data.isMaster,
      });
    }

    // Clean up monitoring data
    this.monitoringData.delete(sessionId);
    this.healthStatus.delete(sessionId);
  }

  /**
   * Update health status for an Agent.
   */
  private updateHealthStatus(sessionId: string): void {
    const data = this.monitoringData.get(sessionId);

    if (!data) {
      return;
    }

    const now = Date.now();
    const inactiveTime = now - data.lastActivity;
    const avgExecutionTime = data.taskCount > 0
      ? data.totalExecutionTime / data.taskCount
      : 0;

    let status: 'healthy' | 'stale' | 'error' = 'healthy';

    if (inactiveTime > this.config.staleThreshold) {
      status = 'stale';
    } else if (data.errorCount > 0) {
      status = 'error';
    }

    const health: AgentHealth = {
      agentId: sessionId, // Using sessionId as agentId for now
      sessionId,
      status,
      taskCount: data.taskCount,
      lastActivity: data.lastActivity,
      totalExecutionTime: data.totalExecutionTime,
      averageExecutionTime: avgExecutionTime,
      errorCount: data.errorCount,
    };

    this.healthStatus.set(sessionId, health);
  }

  /**
   * Get health status for an Agent.
   */
  getHealthStatus(sessionId: string): AgentHealth | undefined {
    return this.healthStatus.get(sessionId);
  }

  /**
   * Get all Agent health statuses.
   */
  getAllHealthStatuses(): AgentHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get monitoring data for an Agent.
   */
  getMonitoringData(sessionId: string): AgentMonitoringData | undefined {
    return this.monitoringData.get(sessionId);
  }

  async onAwaitingHITL(
    _question: string,
    _options?: string[],
    _agentContext?: any
  ): Promise<void | undefined> {
    // Not used in this hook
    return undefined;
  }
}
