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
  FailureExperience,
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
      enableRecentSkillExecutions: config.enableRecentSkillExecutions ?? false,
      enableFailureExperiences: config.enableFailureExperiences ?? false,
      maxFailureExperiences: config.maxFailureExperiences ?? 5,
      maxRecentExecutions: config.maxRecentExecutions ?? 5,
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

    // 6. 最近技能执行记录（可选）
    if (this.config.enableRecentSkillExecutions) {
      const recentExecutions = this.retrieveRecentSkillExecutions(context);
      if (recentExecutions.length > 0) {
        result.recentSkillExecutions = recentExecutions;
      }
    }

    // 7. 失败经验（可选）
    if (this.config.enableFailureExperiences) {
      const failureExperiences = this.retrieveFailureExperiences(context, state);
      if (failureExperiences.length > 0) {
        result.failureExperiences = failureExperiences;
      }
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

  /**
   * 检索最近的技能执行记录
   * @returns 最近执行的技能记录（最多 maxRecentExecutions 条）
   */
  private retrieveRecentSkillExecutions(context: any): Array<{
    skillName: string;
    success: boolean;
    timestamp: Date;
    error?: string;
    scenario?: string;
  }> {
    // 从 context.skillExecutionHistory 获取所有执行记录
    const skillHistory = context?.skillExecutionHistory || [];

    // 按时间排序（最新的在前）
    const sorted = [...skillHistory].sort(
      (a: any, b: any) =>
        new Date(b.startedAt || b.timestamp).getTime() -
        new Date(a.startedAt || a.timestamp).getTime()
    );

    // 返回最近的 maxRecentExecutions 条
    const maxCount = this.config.maxRecentExecutions || 5;
    return sorted.slice(0, maxCount).map((record: any) => ({
      skillName: record.skillName,
      success: record.success ?? true,
      timestamp: new Date(record.startedAt || record.timestamp),
      error: record.error,
      scenario: record.scenario,
    }));
  }

  /**
   * 检索失败经验
   * @returns 相关的失败经验列表
   */
  private retrieveFailureExperiences(
    context: any,
    state: SessionState
  ): FailureExperience[] {
    // 1. 提取当前任务信息
    const currentTask = this.getCurrentTask(context, state);

    // 2. 提取计划使用的技能
    const plannedSkills = this.extractPlannedSkills(state);

    // 3. 提取历史错误和解决方案
    const errorsAndSolutions = this.extractErrorsAndSolutions(context);

    // 4. 执行检索逻辑
    const experiences = this.performRetrieval(
      currentTask,
      plannedSkills,
      errorsAndSolutions
    );

    // 5. 限制返回数量
    const maxCount = this.config.maxFailureExperiences || 5;
    return experiences.slice(0, maxCount);
  }

  /**
   * 从任务和技能名称中提取关键词
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // 移除特殊字符，保留字母数字和中文
    const cleaned = text.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');

    // 分词（按空格、常见分隔符）
    const words = cleaned
      .split(/[\s\-_/.]+/)
      .filter((word) => word.length > 2); // 过滤短词

    // 去重
    return Array.from(new Set(words));
  }

  /**
   * 计算失败经验的相关性分数
   * @returns 分数范围 [0, 1]，越高越相关
   */
  private calculateRelevanceScore(
    experience: FailureExperience,
    taskKeywords: string[],
    skillKeywords: string[]
  ): number {
    let score = 0;
    const experienceText = `${experience.scenario} ${experience.error} ${experience.solution}`
      .toLowerCase();

    // 1. 技能名称匹配（高权重）
    if (experience.skillName) {
      const skillLower = experience.skillName.toLowerCase();
      for (const keyword of skillKeywords) {
        if (skillLower.includes(keyword) || keyword.includes(skillLower)) {
          score += 0.4;
          break; // 只匹配一次
        }
      }
    }

    // 2. 任务关键词匹配（中权重）
    for (const keyword of taskKeywords) {
      if (experienceText.includes(keyword)) {
        score += 0.3;
      }
    }

    // 3. 频率权重（最多 0.2）
    const frequencyBoost = Math.min(experience.frequency * 0.1, 0.2);
    score += frequencyBoost;

    // 4. 时效性权重（最近 7 天的加权，最多 0.1）
    const daysSinceLastOccurrence =
      (Date.now() - new Date(experience.lastOccurred).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceLastOccurrence < 7) {
      score += 0.1 * (1 - daysSinceLastOccurrence / 7);
    }

    return Math.min(score, 1); // 最大分数为 1
  }

  /**
   * 标准化错误文本（用于频率统计）
   */
  private normalizeErrorText(error: string): string {
    if (!error) return '';

    return error
      .toLowerCase()
      .replace(/\d+/g, 'N') // 数字替换为 N
      .replace(/[/\\]/g, '/') // 路径分隔符统一
      .replace(/\s+/g, ' ') // 多个空格合并
      .trim();
  }

  /**
   * 从 context 中提取错误和解决方案
   */
  private extractErrorsAndSolutions(context: any): Array<{
    error: string;
    solution: string;
    timestamp: Date;
    skillName?: string;
    toolName?: string;
    scenario?: string;
  }> {
    const results: Array<{
      error: string;
      solution: string;
      timestamp: Date;
      skillName?: string;
      toolName?: string;
      scenario?: string;
    }> = [];

    // 1. 从 summary.errorsAndSolutions 提取
    const summaryErrors = context?.summary?.errorsAndSolutions || [];
    for (const entry of summaryErrors) {
      results.push({
        error: entry.error,
        solution: entry.solution,
        timestamp: new Date(entry.timestamp || Date.now()),
      });
    }

    // 2. 从 skillExecutionHistory 提取失败的执行
    const skillHistory = context?.skillExecutionHistory || [];
    for (const record of skillHistory) {
      if (!record.success && record.error) {
        // 尝试从错误信息中提取解决方案（简单实现）
        const solution = this.extractSolutionFromError(record.error);

        results.push({
          error: record.error,
          solution: solution || 'No solution documented',
          timestamp: new Date(record.completedAt || record.timestamp),
          skillName: record.skillName,
          scenario: record.scenario,
        });
      }
    }

    // 3. 从 toolUsageHistory 提取失败的工具使用
    const toolHistory = context?.toolUsageHistory || [];
    for (const record of toolHistory) {
      if (!record.success && record.error) {
        const solution = this.extractSolutionFromError(record.error);

        results.push({
          error: record.error,
          solution: solution || 'No solution documented',
          timestamp: new Date(record.timestamp),
          toolName: record.toolName,
          scenario: record.summary,
        });
      }
    }

    return results;
  }

  /**
   * 从错误信息中尝试提取解决方案
   */
  private extractSolutionFromError(error: string): string | null {
    if (!error) return null;

    // 常见解决方案关键词
    const solutionPatterns = [
      /(?:try|you can|solution is?:)\s+([^.]+\.)/gi,
      /(?:fix|resolve|solved by)\s+([^.]+\.)/gi,
    ];

    for (const pattern of solutionPatterns) {
      const match = error.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 获取当前任务描述
   */
  private getCurrentTask(context: any, state: SessionState): string {
    // 优先从 conversation history 的最后一条用户消息获取
    const history = state.conversationHistory || [];
    const lastUserMessage = [...history]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (lastUserMessage) {
      return lastUserMessage.content;
    }

    // 其次从 summary.currentTask 获取
    if (context?.summary?.currentTask) {
      return context.summary.currentTask;
    }

    // 最后从 context.originalTask 获取
    if (context?.originalTask) {
      return context.originalTask;
    }

    return '';
  }

  /**
   * 从 state 中提取计划使用的技能
   */
  private extractPlannedSkills(state: SessionState): string[] {
    const skills: string[] = [];

    // 从 execution history 中提取最近使用的技能
    const history = state.executionHistory || [];
    for (const record of history) {
      if (record.result?.skillName) {
        skills.push(record.result.skillName);
      }
      if (record.result?.toolName) {
        skills.push(record.result.toolName);
      }
    }

    return Array.from(new Set(skills)); // 去重
  }

  /**
   * 执行检索逻辑：评分、排序、转换
   */
  private performRetrieval(
    currentTask: string,
    plannedSkills: string[],
    errorsAndSolutions: Array<{
      error: string;
      solution: string;
      timestamp: Date;
      skillName?: string;
      toolName?: string;
      scenario?: string;
    }>
  ): FailureExperience[] {
    // 1. 提取关键词
    const taskKeywords = this.extractKeywords(currentTask);
    const skillKeywords = this.extractKeywords(plannedSkills.join(' '));

    // 2. 统计错误频率
    const errorFrequency = new Map<string, number>();
    const normalizedErrors = new Map<string, any>();

    for (const entry of errorsAndSolutions) {
      const normalized = this.normalizeErrorText(entry.error);
      const count = errorFrequency.get(normalized) || 0;
      errorFrequency.set(normalized, count + 1);

      // 保留第一次出现的信息（通常是最详细的）
      if (!normalizedErrors.has(normalized)) {
        normalizedErrors.set(normalized, entry);
      }
    }

    // 3. 构建 FailureExperience 列表
    const experiences: FailureExperience[] = [];

    for (const [normalizedError, entry] of normalizedErrors.entries()) {
      const frequency = errorFrequency.get(normalizedError) || 1;

      const experience = this.enhanceToFailureExperience(entry, frequency);
      experiences.push(experience);
    }

    // 4. 计算相关性分数并排序
    const scoredExperiences = experiences
      .map((exp) => ({
        experience: exp,
        score: this.calculateRelevanceScore(exp, taskKeywords, skillKeywords),
      }))
      .sort((a, b) => b.score - a.score) // 按分数降序排序
      .map((item) => item.experience);

    return scoredExperiences;
  }

  /**
   * 将 ErrorAndSolution 转换为 FailureExperience
   */
  private enhanceToFailureExperience(
    entry: {
      error: string;
      solution: string;
      timestamp: Date;
      skillName?: string;
      toolName?: string;
      scenario?: string;
    },
    frequency: number
  ): FailureExperience {
    return {
      skillName: entry.skillName,
      toolName: entry.toolName,
      scenario: entry.scenario || entry.error.split('\n')[0].slice(0, 100), // 使用错误的第一行作为场景
      error: entry.error,
      solution: entry.solution,
      frequency,
      lastOccurred: entry.timestamp,
    };
  }
}
