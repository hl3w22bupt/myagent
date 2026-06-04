/**
 * Context Orchestration Layer
 *
 * 编排层接口 - 负责从多个数据源获取和组装上下文
 *
 * 职责：
 * - 理解 Agent 的上下文需求
 * - 决定从哪些数据源获取数据
 * - 组装并返回格式化的上下文
 */

import type { UserProfile } from '../database/data-store.js';
import type { SessionState } from '../agent/types.js';

/**
 * 失败经验 - 从历史执行中提取的教训
 */
export interface FailureExperience {
  /** 相关的技能名称（可选） */
  skillName?: string;

  /** 相关的工具名称（可选） */
  toolName?: string;

  /** 触发场景描述（用于匹配当前任务） */
  scenario: string;

  /** 错误信息 */
  error: string;

  /** 解决方案 */
  solution: string;

  /** 出现频率（用于排序和优先级） */
  frequency: number;

  /** 最后发生时间（用于时效性判断） */
  lastOccurred: Date;
}

/**
 * 编排层返回的上下文
 *
 * 包含 Agent 执行所需的各种上下文信息
 */
export interface OrchestratedContext {
  /** 对话历史 */
  history: Array<{ role: string; content: string; timestamp: number }>;

  /** 可用变量 */
  variables: Record<string, any>;

  /** 原始任务（多轮对话时使用） */
  originalTask?: string;

  /** 用户画像（原始格式，不格式化） */
  userProfile?: UserProfile;

  /** 应用特定上下文（如 AI 女友的角色设定） */
  userContext?: any;

  /** 环境配置（workspace, gitUrl, language 等） */
  environment?: Record<string, any>;

  // 新增：最近的技能执行记录（原始数据，最近 5 条）
  recentSkillExecutions?: {
    skillName: string;
    success: boolean;
    timestamp: Date;
    error?: string;
    scenario?: string;
  }[];

  // 新增：失败经验（用于 LLM 决策）
  failureExperiences?: FailureExperience[];

  // RAG: Knowledge collection name for retrieving relevant knowledge
  knowledgeCollection?: string;

  // RAG: App identifier for auto-discovering knowledge collections
  app?: string;
}

/**
 * 上下文编排器接口
 *
 * 职责：从多个数据源获取和组装上下文
 */
export interface ContextOrchestrator {
  /**
   * 为 Agent 组装上下文
   *
   * @param context - 任务上下文（来自数据库）
   * @param state - 会话状态
   * @returns 组装好的上下文
   */
  getContext(context: any, state: SessionState): Promise<OrchestratedContext>;
}

/**
 * 编排层配置选项
 */
export interface OrchestratorConfig {
  /** 是否启用用户画像注入 */
  enableUserProfile?: boolean;

  // 新增：是否启用技能执行历史检索
  enableRecentSkillExecutions?: boolean;

  // 新增：是否启用失败经验检索
  enableFailureExperiences?: boolean;

  // 新增：失败经验最大返回数量
  maxFailureExperiences?: number;

  // 新增：最近执行记录最大返回数量
  maxRecentExecutions?: number;
}
