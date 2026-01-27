/**
 * AgentProgressNotifyHook - Sends progress notifications to Stream.
 *
 * Provides real-time progress updates during Agent execution:
 * - Agent acquisition events
 * - Task start/complete events
 * - Agent status updates
 *
 * Features:
 * - Real-time progress notifications via Motia streams
 * - Structured event data
 * - Error handling (doesn't fail if stream is unavailable)
 *
 * Example:
 * ```typescript
 * const progressNotifyHook = new AgentProgressNotifyHook({
 *   notifyOnAcquire: true,
 *   notifyOnTaskStart: true,
 *   notifyOnTaskComplete: true
 * });
 * hookManager.register(progressNotifyHook);
 * ```
 */

import { BaseAgentHook, type Agent } from './base';
import type { AgentConfig, AgentResult } from '../types';

/**
 * Configuration for AgentProgressNotifyHook.
 */
export interface AgentProgressNotifyConfig {
  /** Whether to notify when Agent is acquired */
  notifyOnAcquire?: boolean;

  /** Whether to notify when task starts */
  notifyOnTaskStart?: boolean;

  /** Whether to notify when task completes */
  notifyOnTaskComplete?: boolean;

  /** Whether to notify on status checks */
  notifyOnStatusCheck?: boolean;
}

/**
 * Streams interface for progress notifications.
 */
interface Streams {
  agentProgress?: {
    set: (key: string, value: any) => Promise<void>;
  };
}

/**
 * Global streams storage (will be set externally).
 */
let globalStreams: Streams | undefined;

/**
 * Set global streams for progress notifications.
 *
 * This should be called by the Agent step handler to provide
 * the streams instance for sending progress updates.
 *
 * @param streams - Motia streams instance
 */
export function setAgentStreams(streams: Streams): void {
  globalStreams = streams;
}

/**
 * Get global streams.
 *
 * @returns Streams instance or undefined
 */
export function getAgentStreams(): Streams | undefined {
  return globalStreams;
}

/**
 * Sends progress notifications to Stream.
 *
 * This hook sends structured event data to the agentProgress stream
 * for real-time UI updates.
 */
export class AgentProgressNotifyHook extends BaseAgentHook {
  private config: Required<AgentProgressNotifyConfig>;

  constructor(config: AgentProgressNotifyConfig = {}) {
    super();
    this.config = {
      notifyOnAcquire: config.notifyOnAcquire ?? true,
      notifyOnTaskStart: config.notifyOnTaskStart ?? true,
      notifyOnTaskComplete: config.notifyOnTaskComplete ?? true,
      notifyOnStatusCheck: config.notifyOnStatusCheck ?? false,
    };
  }

  /**
   * Called when Agent is created.
   * No notification needed (Agent doesn't exist yet).
   */
  async onAgentCreate(
    _config: AgentConfig,
    _sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    return undefined;
  }

  /**
   * Called when Agent is acquired.
   * Sends notification with Agent details.
   */
  async onAgentAcquire(
    agent: Agent,
    sessionId: string
  ): Promise<void | undefined> {
    if (!this.config.notifyOnAcquire) {
      return;
    }

    try {
      const agentState = agent.getState();
      const agentId = agent.getId();
      const agentType = agent.constructor.name;

      const event = {
        type: 'agent_acquired',
        sessionId,
        agentId,
        agentType,
        timestamp: new Date().toISOString(),
        data: {
          conversationLength: agentState.conversationHistory.length,
          executionCount: agentState.executionHistory.length,
          variablesCount: agentState.variables.size,
        },
      };

      await this.sendNotification(sessionId, event);

      console.log('[AgentProgressNotifyHook] Agent acquired notification sent', {
        sessionId,
        agentId,
        agentType,
      });
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send acquire notification', {
        error,
      });
      // Don't throw - Agent should still work without notifications
    }
  }

  /**
   * Called before task execution.
   * Sends notification with task details.
   */
  async onTaskStart(
    task: string,
    taskId: string,
    context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    if (!this.config.notifyOnTaskStart) {
      return undefined;
    }

    try {
      const event = {
        type: 'task_start',
        sessionId: context.sessionId,
        taskId,
        timestamp: new Date().toISOString(),
        data: {
          task: task.substring(0, 200), // Limit task length
          taskLength: task.length,
        },
      };

      await this.sendNotification(context.sessionId, event);

      console.log('[AgentProgressNotifyHook] Task start notification sent', {
        sessionId: context.sessionId,
        taskId,
      });
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send task start notification', {
        error,
      });
      // Don't throw - task should still execute
    }

    return undefined;
  }

  /**
   * Called after task execution completes.
   * Sends notification with result details.
   */
  async onTaskComplete(
    result: AgentResult,
    context: any
  ): Promise<void | undefined> {
    if (!this.config.notifyOnTaskComplete) {
      return;
    }

    try {
      const sessionId = context.sessionId;
      const taskId = context.taskId;

      const event = {
        type: 'task_complete',
        sessionId,
        taskId,
        timestamp: new Date().toISOString(),
        data: {
          success: result.success,
          executionTime: result.executionTime,
          stepsCount: result.steps.length,
          llmCalls: result.metadata.llmCalls,
          skillCalls: result.metadata.skillCalls,
          totalTokens: result.metadata.totalTokens,
          hasOutput: result.output !== undefined,
          hasError: result.error !== undefined,
        },
      };

      await this.sendNotification(sessionId, event);

      console.log('[AgentProgressNotifyHook] Task complete notification sent', {
        sessionId,
        taskId,
        success: result.success,
      });
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send task complete notification', {
        error,
      });
      // Don't throw - result should still be returned
    }
  }

  /**
   * Called periodically to check Agent status.
   * Optionally sends status update notification.
   */
  async onAgentStatusCheck(agent: Agent): Promise<void | undefined> {
    if (!this.config.notifyOnStatusCheck) {
      return;
    }

    try {
      const sessionId = agent.getSessionId();
      const agentState = agent.getState();

      const event = {
        type: 'agent_status',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          conversationLength: agentState.conversationHistory.length,
          executionCount: agentState.executionHistory.length,
          variablesCount: agentState.variables.size,
          lastActivity: agentState.lastActivityAt,
        },
      };

      await this.sendNotification(sessionId, event);
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send status notification', {
        error,
      });
      // Don't throw - status check should continue
    }
  }

  /**
   * Called before Agent is destroyed.
   * No notification needed (Agent is being destroyed).
   */
  async onAgentDestroy(_sessionId: string): Promise<void | undefined> {
    // No notification on destroy
  }

  /**
   * Send notification to stream.
   *
   * @param sessionId - Session identifier
   * @param event - Event data
   */
  private async sendNotification(sessionId: string, event: any): Promise<void> {
    if (!globalStreams?.agentProgress) {
      console.warn('[AgentProgressNotifyHook] No agentProgress stream available');
      return;
    }

    try {
      await globalStreams.agentProgress.set(sessionId, event);
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send notification to stream', {
        sessionId,
        error,
      });
      throw error;
    }
  }
}
