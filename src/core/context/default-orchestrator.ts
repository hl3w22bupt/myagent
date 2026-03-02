/**
 * Default Context Orchestrator
 *
 * 默认的上下文编排器实现
 *
 * 设计原则：
 * - 精准按需取数据，不多取也不少取
 * - 和没有编排器时的行为保持一致
 * - history/variables 从 state 取（原有行为）
 * - userProfile 从 context.workingMemory 取（新增）
 */

import type {
  ContextOrchestrator,
  OrchestratedContext,
  OrchestratorConfig,
} from './orchestrator';
import type { SessionState } from '../agent/types';

/**
 * 默认上下文编排器
 *
 * 实现精准的上下文获取逻辑
 */
export class DefaultContextOrchestrator implements ContextOrchestrator {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      enableUserProfile: config.enableUserProfile ?? true,
    };
  }

  /**
   * 为 Agent 组装上下文
   *
   * @param context - 任务上下文（来自数据库）
   * @param state - 会话状态
   * @returns 组装好的上下文
   */
  async getContext(context: any, state: SessionState): Promise<OrchestratedContext> {
    const result: OrchestratedContext = {
      // 1. 对话历史：直接从 state 取（和没有编排器时一样）
      history: state.conversationHistory || [],

      // 2. 变量：直接从 state 取（和没有编排器时一样）
      variables: state.variables instanceof Map
        ? Object.fromEntries(state.variables)
        : state.variables || {},
    };

    // 3. 原始任务（多轮对话时使用）
    if (context?.originalTask) {
      result.originalTask = context.originalTask;
    }

    // 4. 用户画像：从 context.workingMemory 取（新增）
    if (this.config.enableUserProfile) {
      const userProfile = this.extractUserProfile(context);
      if (userProfile) {
        result.userProfile = userProfile;
      }
    }

    // 5. 应用特定上下文：从 context.workingMemory 取（如 AI 女友的角色设定）
    const userContext = this.extractUserContext(context);
    if (userContext) {
      result.userContext = userContext;
    }

    return result;
  }

  /**
   * 提取用户画像
   *
   * 从 context.workingMemory.userProfile 或 context.context.workingMemory.userProfile 获取
   */
  private extractUserProfile(context: any): any {
    // 优先从嵌套的 context.context.workingMemory.userProfile 获取
    if (context?.context?.workingMemory?.userProfile) {
      return context.context.workingMemory.userProfile;
    }

    // 其次从 context.workingMemory.userProfile 获取
    if (context?.workingMemory?.userProfile) {
      return context.workingMemory.userProfile;
    }

    return null;
  }

  /**
   * 提取应用特定上下文
   *
   * 从 context.workingMemory.userContext 或 context.context.workingMemory.userContext 获取
   */
  private extractUserContext(context: any): any {
    // 优先从嵌套的 context.context.workingMemory.userContext 获取
    if (context?.context?.workingMemory?.userContext) {
      return context.context.workingMemory.userContext;
    }

    // 其次从 context.workingMemory.userContext 获取
    if (context?.workingMemory?.userContext) {
      return context.workingMemory.userContext;
    }

    return null;
  }
}
