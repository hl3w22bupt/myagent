/**
 * 上下文管理系统的类型定义
 */

/**
 * 任务上下文结构
 */
export interface TaskContext {
  // 基础信息
  taskId: string;
  sessionId: string;
  currentTurn: number;

  // 对话历史
  messages: Message[];

  // 压缩摘要（Anchored Iterative Summarization）
  summary: StructuredSummary;

  // Artifact索引
  artifactIndex: ArtifactIndex[];

  // 临时工作内存
  workingMemory: Record<string, any>;

  // 元数据
  metadata: {
    totalTokens: number;
    llmCallsCount: number;
    skillCallsCount: number;
    lastCompressedAt?: Date;
  };
}

/**
 * 消息结构
 */
export interface Message {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    timestamp: Date;
    tokens?: number;
    llmCalls?: number;
    skillCalls?: string[];
    sessionId?: string;
  };
  compressed?: boolean;
}

/**
 * 结构化摘要
 */
export interface StructuredSummary {
  // 会话意图
  sessionIntent: string;

  // 当前任务目标
  currentTask: string;

  // 已完成的步骤
  completedSteps: string[];

  // 文件修改记录
  filesModified: FileModification[];

  // 关键决策
  decisionsMade: Decision[];

  // 当前状态
  currentStatus: string;

  // 下一步计划
  nextSteps: string[];

  // 错误和解决方案
  errorsAndSolutions: ErrorAndSolution[];

  // 技术细节
  technicalDetails: {
    functionNames?: string[];
    errorCodes?: string[];
    dependencies?: string[];
  };
}

/**
 * Artifact索引
 */
export interface ArtifactIndex {
  id: string;
  taskId: string;
  artifactType: 'file' | 'function' | 'variable' | 'error' | 'video';
  action: 'created' | 'modified' | 'read' | 'deleted' | 'generated';
  path: string;
  description?: string;
  commitHash?: string;
  timestamp: Date;
}

/**
 * 文件修改记录
 */
export interface FileModification {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  description: string;
  commitHash?: string;
  timestamp: Date;
}

/**
 * 决策记录
 */
export interface Decision {
  topic: string;
  decision: string;
  reasoning: string;
  timestamp: Date;
}

/**
 * 错误和解决方案
 */
export interface ErrorAndSolution {
  error: string;
  solution: string;
  timestamp: Date;
}

/**
 * 上下文压缩历史
 */
export interface CompressionHistory {
  id: string;
  taskId: string;
  compressedAt: Date;
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  summary: StructuredSummary;
  truncatedMessageIds: string[];
}
