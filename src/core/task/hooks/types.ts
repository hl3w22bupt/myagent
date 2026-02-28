import { ConversationHistoryEntry } from '../../database/context-types';

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
    currentTurn: number;
    conversationRounds: any[];  // 新格式：扁平的对话轮次
    messages: any[];
    summary: any;
    artifactIndex: any[];
    workingMemory: Record<string, any>;
    metadata: {
      lastCompressedAt?: Date;
    };
    conversationHistory?: ConversationHistoryEntry[];  // ⭐ 对话历史（由 TaskHook 预加载）
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
