/**
 * 上下文管理系统的类型定义
 */

/**
 * 对话历史条目（用于 Agent 层）
 */
export interface ConversationHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * 对话轮次信息（扁平结构，避免嵌套）
 * 用于替代嵌套的 messages 数组，提供更清晰的对话历史
 */
export interface ConversationRound {
  /** 轮次编号 */
  round: number;

  /** 时间戳 */
  timestamp: Date;

  /** 用户消息 */
  userMessage: string;

  /** 助手回复（成功时有值） */
  assistantReply?: string;

  /** ⭐ 兼容字段：assistantOutput 是 assistantReply 的别名 */
  assistantOutput?: string;

  /** 产物信息（成功时有值） */
  artifacts?: ArtifactInfo[];

  /** 错误信息（失败时有值） */
  error?: string;
}

/**
 * 产物信息（用于对话轮次记录）
 */
export interface ArtifactInfo {
  /** 产物类型：video, text, code, image, audio, table, infographic 等 */
  type: string;

  /** 文件路径（对于有文件的产物） */
  path?: string;

  /** 内容（对于文本类型） */
  content?: string;

  /** 描述 */
  description?: string;
}

/**
 * HITL (Human-in-the-Loop) 状态
 */
export interface HITLState {
  /** 卡点位置：pre_intent（意图识别前）或 post_intent（意图识别后）或 in_execution（执行中） */
  stage: 'pre_intent' | 'post_intent' | 'in_execution';

  /** 卡点状态：awaiting（等待用户）或 completed（已收到用户反馈） */
  status: 'awaiting' | 'completed';

  /** 向用户提出的问题 */
  question?: string;

  /** 预定义的可选选项（如果有） */
  options?: string[];

  /** 需要澄清的用户 ID（如果有） */
  userId?: string;

  /** 卡点创建时间 */
  createdAt: Date;

  /** 用户回复内容 */
  response?: {
    content: string;
    timestamp: Date;
  };
}

/**
 * 任务上下文结构
 */
export interface TaskContext {
  // 基础信息
  taskId: string;
  sessionId: string;

  // 对话轮次（扁平结构）
  conversationRounds: ConversationRound[];

  // 对话历史（由 TaskHook 预加载，供 Agent 使用）
  conversationHistory?: ConversationHistoryEntry[];

  // 压缩摘要（Anchored Iterative Summarization）
  summary: StructuredSummary;

  // Artifact索引
  artifactIndex: ArtifactIndex[];

  // 临时工作内存
  workingMemory: Record<string, any>;

  // HITL 卡点状态
  hitlState?: HITLState;

  // 元数据
  metadata: {
    lastCompressedAt?: Date;
    compressed?: boolean;
  };
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
  artifactType:
    | 'file'
    | 'function'
    | 'variable'
    | 'error'
    | 'video'
    | 'image'
    | 'audio'
    | 'code'
    | 'html'
    | 'markdown'
    | 'json'
    | 'text';
  action: 'created' | 'modified' | 'read' | 'deleted' | 'generated';
  path: string;
  description?: string;
  commitHash?: string;
  metadata?: Record<string, any>;  // 扩展属性字段（与其他表保持一致）
  timestamp: Date;
}

/**
 * Output索引 - 用于跟踪多轮对话的输出记录
 * 设计类似 ArtifactIndex，分离关注点，避免并发问题
 */
export interface OutputIndex {
  id: string;
  taskId: string;
  sessionId: string;
  round: number;
  output: string;
  executionTime?: number;
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
