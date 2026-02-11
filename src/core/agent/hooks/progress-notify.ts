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
  taskExecution?: {
    set(groupId: string, entryId: string, value: any): Promise<void>;
  };
  executionTraces?: {
    set(groupId: string, id: string, data: any): Promise<any>;
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
 * This hook sends structured event data to the taskExecution stream
 * for real-time UI updates.
 */
export class AgentProgressNotifyHook extends BaseAgentHook {
  private config: Required<AgentProgressNotifyConfig>;

  constructor(config: AgentProgressNotifyConfig = {}) {
    super();
    this.config = {
      notifyOnAcquire: config.notifyOnAcquire ?? false, // ⚠️ 禁用，避免重复通知
      notifyOnTaskStart: config.notifyOnTaskStart ?? true,
      notifyOnTaskComplete: config.notifyOnTaskComplete ?? true,
      notifyOnStatusCheck: config.notifyOnStatusCheck ?? false,
    };
  }

  /**
   * Called when Agent is created.
   * Sends notification with Agent creation details.
   */
  async onAgentCreate(
    config: AgentConfig,
    sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    try {
      // AgentConfig doesn't have agentType or skills, use availableSkills
      const agentType = 'Agent'; // Default agent type
      const skillsCount = config.availableSkills?.length || 0;

      const event = {
        type: 'agent_created',
        sessionId,
        agentType,
        timestamp: new Date().toISOString(),
        data: {
          agentType,
          skillsCount,
          hasSystemPrompt: !!config.systemPrompt,
        },
      };

      await this.sendNotification(sessionId, event);

      console.log('[AgentProgressNotifyHook] Agent created notification sent', {
        sessionId,
        agentType,
        skillsCount,
      });
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send created notification', {
        error,
      });
      // Don't throw - Agent should still be created
    }

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
      // Use sessionId as agentId since Agent doesn't have getId() method
      const agentId = sessionId;
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
   *
   * 统一数据结构：
   * - type: 'agent'
   * - stage: 'pre'
   * - category: 'agent_hook'
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
      const sessionId = context.sessionId;
      const agentType = context.agentType || 'Agent';

      const event = {
        type: 'agent',  // 统一为 'agent'
        stage: 'pre',   // 统一使用 stage 字段
        progressType: 'user-request',
        status: 'started',
        sessionId,
        taskId,
        timestamp: new Date().toISOString(),
        data: {
          task: task.substring(0, 200),
          taskLength: task.length,
          agentType,
        }
      };

      await this.sendNotification(sessionId, event);

      console.log('[AgentProgressNotifyHook] Task start notification sent', {
        sessionId,
        taskId,
        agentType,
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
   *
   * 统一数据结构：
   * - type: 'agent'
   * - stage: 'post'
   * - category: 'agent_hook'
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

      // 获取 artifact 数量（支持多种 context 结构）
      const artifactCount = context.artifactIndex?.length ||
                            context.context?.artifactIndex?.length ||
                            0;

      const event = {
        type: 'agent',  // 统一为 'agent'
        stage: 'post',  // 统一使用 stage 字段
        progressType: 'task-result',
        status: result.success ? 'completed' : 'failed',
        sessionId,
        taskId,
        timestamp: new Date().toISOString(),
        data: {
          success: result.success,
          artifactCount,
        }
      };

      await this.sendNotification(sessionId, event);

      console.log('[AgentProgressNotifyHook] Task complete notification sent', {
        sessionId,
        taskId,
        success: result.success,
        artifactCount,
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
   * 不发送通知（Agent 在多轮对话中会复用，不会立即销毁）
   */
  async onAgentDestroy(_sessionId: string): Promise<void | undefined> {
    // No notification needed
  }

  /**
   * Send notification to stream.
   *
   * 使用 taskExecution stream 发送所有 Agent Hook 事件，
   * 与 task hook 和 skill hook 统一使用同一个 stream。
   *
   * @param sessionId - Session identifier
   * @param event - Event data (must contain taskId)
   */
  private async sendNotification(sessionId: string, event: any): Promise<void> {
    if (!globalStreams?.taskExecution) {
      console.warn('[AgentProgressNotifyHook] No taskExecution stream available');
      return;
    }

    try {
      // Use taskId as groupId (to match frontend subscription)
      const groupId = event.taskId || sessionId;

      // Create a unique entryId for each event
      const timestamp = Date.now();
      const entryId = `agent-${event.type}-${groupId}-${timestamp}`;

      console.log('[AgentProgressNotifyHook] Sending to taskExecution stream:', {
        groupId,
        entryId,
        eventType: event.type,
        taskId: event.taskId,
      });

      // 发送到 taskExecution stream（与 task hook 和 skill hook 统一）
      await globalStreams.taskExecution.set(groupId, entryId, {
        ...event,
        category: 'agent_hook', // 标识为 agent hook 事件
      });

      console.log('[AgentProgressNotifyHook] ✅ Data sent to taskExecution stream successfully');
    } catch (error) {
      console.error('[AgentProgressNotifyHook] Failed to send notification to stream', {
        sessionId,
        error,
      });
      throw error;
    }
  }
}
