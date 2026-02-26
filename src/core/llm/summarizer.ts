/**
 * LLM摘要器
 *
 * 使用LLM生成上下文的结构化摘要
 *
 * 功能:
 * - 为对话历史生成结构化摘要
 * - 支持多种 JSON 格式解析
 * - 降级策略保证在 LLM 调用失败时仍能返回有效摘要
 */

import { LLMClient } from './client';
import { LLMClientFactory } from './factory';
import type { Message, StructuredSummary, FileModification, Decision, ErrorAndSolution } from '../database/context-types';

export interface LLMSummarizerConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/**
 * 压缩配置
 */
export const COMPRESSION_CONFIG = {
  maxTokens: 100000,      // 最大 token 数
  threshold: 0.8,         // 80% 时触发压缩
  messagesToKeep: 20,     // 保留最近 20 条消息
  targetCompressionRatio: 0.5,  // 压缩到 50%
} as const;

export class LLMSummarizer {
  private client: LLMClient;
  private config: LLMSummarizerConfig;

  constructor(config?: LLMSummarizerConfig) {
    this.config = config || {};
    // Use factory to create LLM client for summarizer (no trace)
    this.client = LLMClientFactory.createForSummarizer(config);
  }

  /**
   * 为LLM调用提供方法（用于测试Mock）
   */
  callLLM: (prompt: string) => Promise<string> = async (prompt: string) => {
    try {
      const response = await this.client.messagesCreate([
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: prompt },
      ]);
      return response.content;
    } catch (error: any) {
      console.error('[LLMSummarizer] LLM call failed:', error.message);
      throw error;
    }
  };

  /**
   * 获取系统提示词
   */
  private getSystemPrompt(): string {
    return `你是一个对话历史摘要专家。你的任务是分析对话历史，生成结构化摘要。

请以 JSON 格式返回，包含以下字段：
- sessionIntent: 会话的主要意图或目标
- currentTask: 当前正在执行的任务
- completedSteps: 已完成的步骤列表
- filesModified: 修改的文件列表（包含 path, action, description, timestamp）
- decisionsMade: 做出的决策列表（包含 topic, decision, reasoning, timestamp）
- currentStatus: 当前状态 (pending|in_progress|completed)
- nextSteps: 下一步计划列表
- errorsAndSolutions: 错误和解决方案列表
- technicalDetails: 技术细节（包含 functionNames, errorCodes, dependencies）

只返回 JSON，不要包含其他解释。`;
  }

  /**
   * 生成上下文的结构化摘要
   */
  async summarizeContext(messages: Message[]): Promise<StructuredSummary> {
    // 1. 构建提示词
    const prompt = this.buildSummarizationPrompt(messages);

    // 2. 调用LLM
    try {
      const response = await this.callLLM(prompt);

      // 3. 解析JSON响应
      return this.parseSummaryResponse(response);
    } catch (error: any) {
      console.error('[LLMSummarizer] Failed to generate summary, using default:', error.message);
      return this.getDefaultSummary(messages);
    }
  }

  /**
   * 解析 LLM 返回的摘要响应
   * 支持多种 JSON 格式
   */
  private parseSummaryResponse(response: string): StructuredSummary {
    try {
      // 尝试提取 JSON (支持 ```json 包裹)
      const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/) ||
                       response.match(/```\n([\s\S]+?)\n```/) ||
                       response.match(/\{[\s\S]+\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return this.validateAndNormalizeSummary(parsed);
      }

      // JSON 解析失败，返回默认摘要
      console.warn('[LLMSummarizer] Could not extract JSON from response');
      return this.getDefaultSummaryFromText(response);
    } catch (e) {
      console.error('[LLMSummarizer] Failed to parse summary response:', e);
      return this.getDefaultSummaryFromText(response);
    }
  }

  /**
   * 验证并标准化摘要数据
   */
  private validateAndNormalizeSummary(parsed: any): StructuredSummary {
    return {
      sessionIntent: parsed.sessionIntent || '',
      currentTask: parsed.currentTask || '',
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      filesModified: Array.isArray(parsed.filesModified)
        ? parsed.filesModified.map((f: any) => ({
            path: f.path || '',
            action: f.action || 'modified',
            description: f.description || '',
            timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
          }))
        : [],
      decisionsMade: Array.isArray(parsed.decisionsMade)
        ? parsed.decisionsMade.map((d: any) => ({
            topic: d.topic || '',
            decision: d.decision || '',
            reasoning: d.reasoning || '',
            timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
          }))
        : [],
      currentStatus: parsed.currentStatus || 'unknown',
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      errorsAndSolutions: Array.isArray(parsed.errorsAndSolutions)
        ? parsed.errorsAndSolutions.map((e: any) => ({
            error: e.error || '',
            solution: e.solution || '',
            timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
          }))
        : [],
      technicalDetails: {
        functionNames: Array.isArray(parsed.technicalDetails?.functionNames)
          ? parsed.technicalDetails.functionNames
          : [],
        errorCodes: Array.isArray(parsed.technicalDetails?.errorCodes)
          ? parsed.technicalDetails.errorCodes
          : [],
        dependencies: Array.isArray(parsed.technicalDetails?.dependencies)
          ? parsed.technicalDetails.dependencies
          : [],
      },
    };
  }

  /**
   * 构建摘要生成的提示词
   */
  private buildSummarizationPrompt(messages: Message[]): string {
    const messagesText = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    return `请分析以下对话历史，生成结构化摘要：

对话历史：
${messagesText}

请只返回 JSON 格式的摘要。`;
  }

  /**
   * 获取默认摘要（当LLM调用失败时使用）
   */
  private getDefaultSummary(messages: Message[]): StructuredSummary {
    return {
      sessionIntent: '无法确定',
      currentTask: messages.length > 0 ? messages[messages.length - 1].content.substring(0, 100) : '未知任务',
      completedSteps: messages.slice(-5).map(m => m.content.substring(0, 50)),
      filesModified: [],
      decisionsMade: [],
      currentStatus: 'unknown',
      nextSteps: [],
      errorsAndSolutions: [],
      technicalDetails: {},
    };
  }

  /**
   * 从文本生成默认摘要（降级策略）
   */
  private getDefaultSummaryFromText(text: string): StructuredSummary {
    return {
      sessionIntent: '无法确定',
      currentTask: text.substring(0, 100),
      completedSteps: [],
      filesModified: [],
      decisionsMade: [],
      currentStatus: 'unknown',
      nextSteps: [],
      errorsAndSolutions: [],
      technicalDetails: {},
    };
  }
}
