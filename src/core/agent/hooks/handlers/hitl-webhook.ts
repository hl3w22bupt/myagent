/**
 * HITL Webhook Hook.
 *
 * Optional webhook notification for HITL (Human In The Loop) requests.
 * When Agent requests clarification, this hook sends a webhook notification
 * to external systems (e.g., MyRD) to alert human operators.
 *
 * Environment Variables:
 * - HITL_WEBHOOK_URL: Webhook endpoint URL (required, otherwise hook is disabled)
 * - MYAGENT_URL: MyAgent base URL (optional, defaults to http://localhost:3000)
 *
 * Configuration Example:
 * ```yaml
 * type: hitl_webhook
 * enabled: true
 * config:
 *   url: "{{ env.HITL_WEBHOOK_URL }}"
 * ```
 */

import { BaseAgentHook } from '../base';
import type { AgentConfig } from '../../types';

/**
 * Webhook payload format.
 */
interface HITLWebhookPayload {
  /** Task ID requiring clarification */
  taskId: string;

  /** Agent name requesting clarification */
  agentName: string;

  /** Session ID */
  sessionId: string;

  /** Clarification question */
  question: string;

  /** Optional multiple choice options */
  options?: string[];

  /** URL to submit clarification response */
  answerUrl: string;

  /** Timestamp of request */
  timestamp: string;
}

/**
 * HITL Webhook Hook implementation.
 */
export class HITLWebhookHook extends BaseAgentHook {
  private url?: string;
  private enabled: boolean = false;
  private myAgentUrl: string;

  constructor(config?: { url?: string }) {
    super();

    // Get webhook URL from config or environment
    this.url = config?.url || process.env.HITL_WEBHOOK_URL;
    this.enabled = !!this.url;

    // Get MyAgent base URL for constructing answer URLs
    this.myAgentUrl = process.env.MYAGENT_URL || 'http://localhost:3000';

    if (!this.enabled) {
      console.warn('[HITLWebhookHook] Webhook disabled - no HITL_WEBHOOK_URL configured');
    }
  }

  /**
   * Not used in this hook.
   */
  async onAgentCreate(
    _config: AgentConfig,
    _sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    return undefined;
  }

  /**
   * Not used in this hook.
   */
  async onAgentAcquire(_agent: any, _sessionId: string): Promise<void | undefined> {
    return undefined;
  }

  /**
   * Not used in this hook.
   */
  async onTaskStart(
    _task: string,
    _taskId: string,
    _context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    return undefined;
  }

  /**
   * Not used in this hook.
   */
  async onTaskComplete(_result: any, _context: any): Promise<void | undefined> {
    return undefined;
  }

  /**
   * Not used in this hook.
   */
  async onAgentStatusCheck(_agent: any): Promise<void | undefined> {
    return undefined;
  }

  /**
   * Not used in this hook.
   */
  async onAgentDestroy(_sessionId: string): Promise<void | undefined> {
    return undefined;
  }

  /**
   * Called when Agent requests human clarification (HITL).
   *
   * Sends webhook notification to external system.
   */
  async onAwaitingHITL(
    question: string,
    options?: string[],
    agentContext?: {
      agentName: string;
      sessionId: string;
      taskId: string;
      intent?: any;
    }
  ): Promise<void | undefined> {
    if (!this.enabled || !this.url) {
      return;
    }

    const { taskId, agentName, sessionId } = agentContext || {};

    if (!taskId) {
      console.error('[HITLWebhookHook] Missing taskId in agentContext');
      return;
    }

    const payload: HITLWebhookPayload = {
      taskId,
      agentName: agentName || 'unknown',
      sessionId: sessionId || 'unknown',
      question,
      options,
      answerUrl: `${this.myAgentUrl}/api/tasks/${taskId}/hitl`,
      timestamp: new Date().toISOString(),
    };

    try {
      console.log('[HITLWebhookHook] Sending webhook notification', {
        url: this.url,
        taskId,
        question,
      });

      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HITL-Event': 'clarification.required',
          'X-Task-ID': taskId,
          'X-Session-ID': sessionId || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error('[HITLWebhookHook] Webhook request failed', {
          status: response.status,
          statusText: response.statusText,
        });
      } else {
        console.log('[HITLWebhookHook] Webhook notification sent successfully', {
          taskId,
          question,
        });
      }
    } catch (error) {
      // Don't throw - webhook failures should not block Agent execution
      console.error('[HITLWebhookHook] Webhook request error', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
    }
  }
}
