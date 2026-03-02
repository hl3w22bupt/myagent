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

import type { UserProfile } from '../database/data-store';
import type { SessionState } from '../agent/types';

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
}
