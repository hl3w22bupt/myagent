import { ConversationHistoryEntry } from '../../database/context-types.js';

/**
 * Task execution context passed to all TaskHooks
 */
export interface TaskContext {
  // Task identification
  taskId: string;
  sessionId: string;
  task: string;
  originalTask?: string;  // 原始用户任务（不含对话历史等上下文）

  // Execution state
  status: 'pending' | 'running' | 'completed' | 'failed';

  // Task context data (for ContextManager)
  // 现在支持完整的TaskContext结构
  context: {
    taskId: string;
    sessionId: string;
    conversationRounds: any[];
    summary: any;
    artifactIndex: any[];
    skillExecutionHistory: any[];
    toolUsageHistory: any[];
    workingMemory: Record<string, any>;
    metadata: {
      lastCompressedAt?: Date;
    };
    conversationHistory?: ConversationHistoryEntry[];
  } | null;

  // Execution metadata
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    userId?: string;
  };

  // Motia service references
  services: {
    streams: any;
    logger: any;
    emit: any;
  };
}

/**
 * Result from preExec hook
 */
export type PreExecResult = void | { stop?: boolean; reason?: string; modifiedTask?: string };

// ============================================================
// Configurable Hook System Types
// ============================================================

// Hook trigger timing
export type HookTrigger = 'preExec' | 'postExec' | 'onProgressingNotify';

// Hook types
export type HookType =
  | 'http_webhook'
  | 'condition_check'
  | 'middleware'
  | 'notification';

// Base hook configuration
export interface ConfigurableHookConfig {
  type: HookType;
  trigger: HookTrigger | HookTrigger[];
  config: Record<string, any>;
}

// HTTP Webhook config
export interface HttpWebhookConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, any>;
  stop_on_response?: {
    field: string;
    operator: string;
    value: any;
  };
  stop_reason?: string;
}

// Condition check config
export interface ConditionCheckConfig {
  patterns: Array<{
    regex: string;
    stop?: boolean;
    reason?: string;
  }>;
}

// Middleware config
export interface MiddlewareConfig {
  set?: Record<string, any>;
  remove?: string[];
  load_from?: Array<{
    source: string;
    target: string;
    cache_ttl?: number;
  }>;
  transform?: Record<string, any>;
}

// Notification config
export interface NotificationConfig {
  channel: 'lark' | 'dingtalk' | 'slack' | 'email';
  webhook?: string;
  message_template: string;
  send_when?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

// Hook handler interface
export interface HookHandler {
  execute(context: TaskContext, config: Record<string, any>): Promise<any>;
}
