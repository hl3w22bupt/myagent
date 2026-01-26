/**
 * LLM摘要器
 *
 * 使用LLM生成上下文的结构化摘要
 */

import { LLMClient } from './client';
import type { Message, StructuredSummary } from '../database/context-types';

export interface LLMSummarizerConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class LLMSummarizer {
  private client: LLMClient;

  constructor(config: LLMSummarizerConfig) {
    this.client = new LLMClient(config);
  }

  /**
   * 为LLM调用提供方法（用于测试Mock）
   */
  callLLM: (prompt: string) => Promise<string> = async (prompt: string) => {
    const response = await this.client.chat([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ]);
    return response.content;
  };

  /**
   * 生成上下文的结构化摘要
   */
  async summarizeContext(messages: Message[]): Promise<StructuredSummary> {
    // 1. 构建提示词
    const prompt = this.buildSummarizationPrompt(messages);

    // 2. 调用LLM
    const response = await this.callLLM(prompt);

    // 3. 解析JSON响应
    try {
      const summary = JSON.parse(response) as StructuredSummary;
      return summary;
    } catch {
      // 如果JSON解析失败，返回默认摘要
      return this.getDefaultSummary(messages);
    }
  }

  /**
   * 构建摘要生成的提示词
   */
  private buildSummarizationPrompt(messages: Message[]): string {
    const messagesText = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    return `
请分析以下对话历史，生成结构化摘要。请以JSON格式返回，包含以下字段：

\`\`\`json
{
  "sessionIntent": "会话的主要意图或目标",
  "currentTask": "当前正在执行的任务",
  "completedSteps": ["步骤1", "步骤2", ...],
  "filesModified": [
    {
      "path": "文件路径",
      "action": "created|modified|deleted",
      "description": "简短描述",
      "timestamp": "ISO日期字符串"
    }
  ],
  "decisionsMade": [
    {
      "topic": "决策主题",
      "decision": "做出的决策",
      "reasoning": "决策理由",
      "timestamp": "ISO日期字符串"
    }
  ],
  "currentStatus": "pending|in_progress|completed",
  "nextSteps": ["下一步1", "下一步2", ...],
  "errorsAndSolutions": [
    {
      "error": "错误描述",
      "solution": "解决方案",
      "timestamp": "ISO日期字符串"
    }
  ],
  "technicalDetails": {
    "functionNames": ["函数1", "函数2", ...],
    "errorCodes": ["错误1", "错误2", ...],
    "dependencies": ["依赖1", "依赖2", ...]
  }
}
\`\`\`

对话历史：
${messagesText}

请只返回JSON，不要包含其他解释。
`.trim();
  }

  /**
   * 获取默认摘要（当LLM调用失败时使用）
   */
  private getDefaultSummary(messages: Message[]): StructuredSummary {
    return {
      sessionIntent: '无法确定',
      currentTask: '未知任务',
      completedSteps: messages.map(m => m.content).slice(0, 5),
      filesModified: [],
      decisionsMade: [],
      currentStatus: 'unknown',
      nextSteps: [],
      errorsAndSolutions: [],
      technicalDetails: {},
    };
  }
}
