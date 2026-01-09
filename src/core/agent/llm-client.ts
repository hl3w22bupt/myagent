/**
 * Unified LLM Client - Wrapper for multiple LLM providers.
 *
 * Supports:
 * - Anthropic (Claude)
 * - OpenAI-compatible (GLM-4, etc.)
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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
}

/**
 * Unified LLM Client that abstracts different provider APIs.
 */
export class LLMClient {
  private provider: LLMProvider;
  private model: string;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

  constructor(config: LLMClientConfig) {
    this.provider = config.provider;
    this.model = config.model || this.getDefaultModel(config.provider);

    switch (config.provider) {
      case 'anthropic':
        this.anthropic = new Anthropic({
          apiKey: config.apiKey,
          baseURL: config.baseURL || 'https://api.anthropic.com'
        });
        break;

      case 'openai-compatible':
        this.openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || 'https://open.bigmodel.cn/api/paas/v4/'
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
   * @returns LLM response
   */
  async messagesCreate(
    messages: LLMMessage[],
    options: {
      max_tokens?: number;
      temperature?: number;
      model?: string;
    } = {}
  ): Promise<LLMResponse> {
    const { max_tokens = 2000, temperature = 0.7, model } = options;
    const actualModel = model || this.model;

    if (this.provider === 'anthropic' && this.anthropic) {
      return await this.anthropicMessagesCreate(messages, max_tokens, temperature, actualModel);
    } else if (this.provider === 'openai-compatible' && this.openai) {
      return await this.openaiMessagesCreate(messages, max_tokens, temperature, actualModel);
    }

    throw new Error('LLM client not initialized');
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
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await this.anthropic!.messages.create({
      model,
      max_tokens,
      temperature,
      system: systemMessage?.content,
      messages: chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
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
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      }
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
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      max_tokens,
      temperature
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
        total_tokens: response.usage?.total_tokens || 0
      }
    };
  }

  /**
   * Get default model for provider.
   */
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'anthropic':
        return 'claude-sonnet-4-5';
      case 'openai-compatible':
        return 'glm-4';
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
      model: this.model
    };
  }
}
