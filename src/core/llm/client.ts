/**
 * Unified LLM Client - 支持多个 LLM Provider 和 Trace
 *
 * 此文件整合了原来的两个 LLMClient 实现：
 * - src/core/agent/llm-client.ts（Agent 使用，支持 trace）
 * - src/core/llm/client.ts（数据库使用，不支持 trace）
 *
 * 现在统一为一个实现，支持：
 * 1. Anthropic (Claude)
 * 2. GLM-4.7 (Anthropic-compatible)
 * 3. GLM-4 (OpenAI-compatible)
 * 4. OpenAI-compatible APIs
 * 5. Execution traces（可选）
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Streams interface for trace collection (minimal type)
 */
interface Streams {
  executionTraces?: {
    set(groupId: string, id: string, data: any): Promise<any>;
  };
}

export type LLMProvider = 'anthropic' | 'openai-compatible';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMClientConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  model?: string;
  /**
   * Optional streams for trace collection
   */
  streams?: Streams;
  /**
   * Optional trace context (taskId, agentId, skillName) for trace collection
   */
  traceContext?: {
    taskId?: string;
    agentId?: string;
    skillName?: string;
  };
}

/**
 * Preset configurations for popular LLM providers.
 */
export class LLMPresets {
  /**
   * Claude (Anthropic)
   */
  static claude(apiKey: string, model: string = 'claude-sonnet-4-5'): LLMClientConfig {
    return {
      provider: 'anthropic',
      apiKey,
      baseURL: 'https://api.anthropic.com',
      model,
    };
  }

  /**
   * GLM-4.7 (Anthropic-compatible API) - Recommended
   */
  static glm47Anthropic(apiKey: string, model: string = 'glm-4.7'): LLMClientConfig {
    return {
      provider: 'anthropic',
      apiKey,
      baseURL: 'https://open.bigmodel.cn/api/anthropic',
      model,
    };
  }

  /**
   * GLM-4 (OpenAI-compatible API)
   */
  static glm4OpenAI(apiKey: string, model: string = 'glm-4'): LLMClientConfig {
    return {
      provider: 'openai-compatible',
      apiKey,
      baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
      model,
    };
  }

  /**
   * OpenAI (GPT-4, etc.)
   */
  static openai(apiKey: string, model: string = 'gpt-4'): LLMClientConfig {
    return {
      provider: 'openai-compatible',
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      model,
    };
  }

  /**
   * Custom OpenAI-compatible endpoint
   */
  static customOpenAI(apiKey: string, baseURL: string, model: string): LLMClientConfig {
    return {
      provider: 'openai-compatible',
      apiKey,
      baseURL,
      model,
    };
  }

  /**
   * Custom Anthropic-compatible endpoint
   */
  static customAnthropic(apiKey: string, baseURL: string, model: string): LLMClientConfig {
    return {
      provider: 'anthropic',
      apiKey,
      baseURL,
      model,
    };
  }
}

/**
 * Unified LLM Client that abstracts different provider APIs.
 */
export class LLMClient {
  private provider: LLMProvider;
  private model: string;
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private streams?: Streams;
  private traceContext?: {
    taskId?: string;
    agentId?: string;
    skillName?: string;
  };

  constructor(config: LLMClientConfig) {
    this.provider = config.provider;
    this.model = config.model || this.getDefaultModel(config.provider);
    this.streams = config.streams;
    this.traceContext = config.traceContext;

    switch (config.provider) {
      case 'anthropic':
        this.anthropic = new Anthropic({
          apiKey: config.apiKey,
          baseURL: config.baseURL || 'https://api.anthropic.com',
        });
        break;

      case 'openai-compatible':
        this.openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || 'https://open.bigmodel.cn/api/paas/v4/',
        });
        break;

      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  /**
   * Create a chat completion.
   *
   * @param messages - Array of messages
   * @param options - Additional options (max_tokens, temperature, etc.)
   * @param purpose - Optional purpose description for this LLM call (e.g., "ptc codegen", "delegation planning")
   * @returns LLM response
   */
  async messagesCreate(
    messages: LLMMessage[],
    options: {
      max_tokens?: number;
      temperature?: number;
      model?: string;
    } = {},
    purpose?: string
  ): Promise<LLMResponse> {
    const { max_tokens = 2000, temperature = 0.7, model } = options;
    const actualModel = model || this.model;

    const startTime = Date.now();

    let response: LLMResponse;
    if (this.provider === 'anthropic' && this.anthropic) {
      response = await this.anthropicMessagesCreate(messages, max_tokens, temperature, actualModel);
    } else if (this.provider === 'openai-compatible' && this.openai) {
      response = await this.openaiMessagesCreate(messages, max_tokens, temperature, actualModel);
    } else {
      throw new Error('LLM client not initialized');
    }

    const executionTime = Date.now() - startTime;

    // Send LLM trace if streams and traceContext are available
    await this.sendLLMTrace(messages, options, response, executionTime, purpose);

    return response;
  }

  /**
   * Send LLM call trace to executionTraces stream.
   */
  private async sendLLMTrace(
    messages: LLMMessage[],
    options: { max_tokens?: number; temperature?: number; model?: string },
    response: LLMResponse,
    executionTime: number,
    purpose?: string
  ): Promise<void> {
    if (!this.streams?.executionTraces || !this.traceContext?.taskId) {
      return;
    }

    try {
      const { taskId, agentId, skillName } = this.traceContext;
      const timestamp = Date.now();
      const id = `llm-${skillName ? 'skill' : 'agent'}-${taskId}-${timestamp}`;

      // Determine trace level based on whether it's a skill or agent call
      const level = skillName ? 'skill-internal' : 'agent-internal';

      await this.streams.executionTraces.set(taskId, id, {
        id,
        level,
        taskId,
        agentId,
        skillName,
        stage: 'llm_call',
        status: 'completed',
        executionTime,
        timestamp: new Date(timestamp).toISOString(),
        purpose, // Add purpose field to trace
        metadata: {
          llmProvider: this.provider,
          llmModel: options.model || this.model,
          sessionId: agentId,
          llmRequest: {
            messages,
            maxTokens: options.max_tokens,
            temperature: options.temperature,
          },
          llmResponse: {
            content: response.content,
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
          },
          data: {
            totalTokens: response.usage?.total_tokens || 0,
          },
        },
      });

      console.log(`[LLMClient] Trace sent: ${id}${purpose ? ` (${purpose})` : ''}`);
    } catch (error) {
      console.error('[LLMClient] Failed to send trace:', error);
    }
  }

  /**
   * Anthropic messages.create wrapper.
   */
  private async anthropicMessagesCreate(
    messages: LLMMessage[],
    max_tokens: number,
    temperature: number,
    model: string
  ): Promise<LLMResponse> {
    // Filter out system messages for Anthropic (they go in a separate param)
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const response = await this.anthropic!.messages.create({
      model,
      max_tokens,
      temperature,
      system: systemMessage?.content,
      messages: chatMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    return {
      content: content.text,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * OpenAI-compatible chat completions wrapper (for GLM-4, etc.).
   */
  private async openaiMessagesCreate(
    messages: LLMMessage[],
    max_tokens: number,
    temperature: number,
    model: string
  ): Promise<LLMResponse> {
    const response = await this.openai!.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens,
      temperature,
    });

    const choice = response.choices[0];
    if (!choice.message?.content) {
      throw new Error('Empty response from OpenAI-compatible API');
    }

    return {
      content: choice.message.content,
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Get default model for provider.
   */
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'anthropic':
        return 'claude-sonnet-4-5'; // Default for Anthropic API
      case 'openai-compatible':
        return 'glm-4'; // Default for GLM OpenAI-compatible API
      default:
        return 'claude-sonnet-4-5';
    }
  }

  /**
   * Get the underlying Anthropic client (for compatibility).
   */
  getAnthropic(): Anthropic | undefined {
    return this.anthropic;
  }

  /**
   * Get provider information.
   */
  getInfo(): { provider: LLMProvider; model: string } {
    return {
      provider: this.provider,
      model: this.model,
    };
  }

  /**
   * Legacy method for backward compatibility with old LLMClient interface
   * Used by LLMSummarizer
   */
  async chat(messages: LLMMessage[]): Promise<{ content: string; usage?: any }> {
    const response = await this.messagesCreate(messages);
    return {
      content: response.content,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }
}
