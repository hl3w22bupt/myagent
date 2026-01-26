/**
 * LLM Client
 *
 * 封装LLM API调用，支持流式和非流式响应
 */

export interface LLMClientConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeout?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class LLMClient {
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = {
      model: 'gpt-4',
      timeout: 30000,
      ...config,
    };
  }

  /**
   * 调用LLM API
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const response = await fetch(this.config.baseURL || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'gpt-4',
          messages,
        }),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return {
        content: data.choices[0].message.content,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM API call timed out');
      }
      throw new Error(`LLM API call failed: ${(error as Error).message}`);
    }
  }

  /**
   * 流式调用LLM API
   */
  async chatStream(_messages: LLMMessage[]): Promise<string> {
    // TODO: 实现流式响应
    throw new Error('Streaming not implemented yet');
  }
}
