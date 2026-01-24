/**
 * Task execution context passed to all TaskHooks
 */
export interface TaskContext {
  // Task identification
  taskId: string;
  sessionId: string;
  task: string;

  // Execution state
  status: 'pending' | 'running' | 'completed' | 'failed';

  // Task context data (for ContextManager, etc.)
  context: any;

  // Execution metadata
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
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
