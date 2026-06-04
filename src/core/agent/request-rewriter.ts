/**
 * Request Rewriter - Multi-turn conversation context enhancement.
 *
 * Rewrites user requests to be complete and self-contained by adding
 * missing context from conversation history.
 *
 * Uses proper message structure:
 * - System message: Instructions for rewriting
 * - User message: Context + current request
 */

import { LLMClient } from './llm-client.js';
import { LLMClientFactory, LLMTraceConfig } from '../llm/factory.js';

export interface ContextSummary {
  currentTask: string;
  completedSteps: string[];
  artifactIndex: Array<{
    artifactType: string;
    path: string;
  }>;
}

export interface RewriteOptions {
  maxHistoryMessages?: number;
  contextSummary?: ContextSummary;
}

/**
 * Request Rewriter for multi-turn conversations.
 */
export class RequestRewriter {
  private llm: LLMClient;
  private readonly DEFAULT_MAX_HISTORY = 10;

  constructor(llm?: LLMClient) {
    // If no LLMClient provided, create one using factory (no trace for request rewriting)
    this.llm = llm || LLMClientFactory.createForSummarizer();
  }

  /**
   * Update LLM client trace configuration.
   * Allows setting trace context after construction.
   */
  setTraceConfig(traceConfig: LLMTraceConfig): void {
    if (this.llm && traceConfig.streams) {
      LLMClientFactory.updateClientTraceConfig(this.llm, traceConfig);
      console.log('[RequestRewriter] Trace config updated');
    }
  }

  /**
   * Static factory method to create RequestRewriter with agent's LLM configuration
   */
  static createWithAgentConfig(agentConfig: { llm?: any }): RequestRewriter {
    const llm = LLMClientFactory.createForAgent(agentConfig);
    return new RequestRewriter(llm);
  }

  /**
   * Rewrite user request based on conversation context.
   *
   * @param currentRequest - Current user input
   * @param conversationHistory - Recent conversation (last N messages)
   * @param options - Rewrite options
   * @returns Rewritten request with full context
   */
  async rewriteRequest(
    currentRequest: string,
    conversationHistory: Array<{role: string; content: string}>,
    options?: RewriteOptions
  ): Promise<string> {
    const maxHistory = options?.maxHistoryMessages || this.DEFAULT_MAX_HISTORY;
    const recentHistory = conversationHistory.slice(-maxHistory);

    console.log('[RequestRewriter] Rewriting request:', {
      original: currentRequest,
      historyLength: recentHistory.length,
      hasContextSummary: !!options?.contextSummary
    });

    // If no history, return original request
    if (recentHistory.length === 0) {
      console.log('[RequestRewriter] No conversation history, returning original request');
      return currentRequest;
    }

    try {
      // Build messages with proper system/user separation
      const messages = this.buildMessages(
        currentRequest,
        recentHistory,
        options?.contextSummary
      );

      const response = await this.llm.messagesCreate(
        messages,
        { max_tokens: 500 },
        'request rewriting'
      );

      const rewritten = response.content.trim();

      console.log('[RequestRewriter] Request rewritten successfully:', {
        original: currentRequest,
        rewritten: rewritten
      });

      return rewritten;
    } catch (error) {
      console.error('[RequestRewriter] Failed to rewrite request:', error);
      // 失败时返回原始请求
      return currentRequest;
    }
  }

  /**
   * Build messages with proper system/user role separation.
   */
  private buildMessages(
    currentRequest: string,
    conversationHistory: Array<{role: string; content: string}>,
    contextSummary?: ContextSummary
  ): Array<{role: 'system' | 'user' | 'assistant'; content: string}> {
    const history = conversationHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const summary = contextSummary ? `
<context_summary>
- Current Task: ${contextSummary.currentTask}
- Completed Steps: ${contextSummary.completedSteps.join(', ')}
- Generated Artifacts: ${contextSummary.artifactIndex.map(a => `${a.artifactType}: ${a.path}`).join(', ')}
</context_summary>
` : '';

    // System message: Instructions for the LLM
    const systemMessage: {role: 'system'; content: string} = {
      role: 'system',
      content: `You are a conversation context analyzer. Your task is to rewrite the user's current request to make it complete and self-contained.

IMPORTANT:
1. The user's current request may be incomplete or refer to previous context
2. Rewrite the request to be complete and self-contained
3. Include all necessary context from conversation history
4. Make it clear what the user wants to do
5. Keep the rewritten request concise but complete

Examples:
- User says "把背景改成红色" → Rewrite to "在 iPhone 17 介绍页面中，把背景改成红色"
- User says "再做一个蓝色的" → Rewrite to "再生成一个蓝色的 iPhone 17 介绍页面"
- User says "把视频时长改为 30 秒" → Rewrite to "把生成的视频时长从当前的 10 秒改为 30 秒"

Output ONLY the rewritten request, nothing else.`
    };

    // User message: Context + current request
    const userMessage: {role: 'user'; content: string} = {
      role: 'user',
      content: `<conversation_history>
${history}
</conversation_history>

${summary}
<current_request>
${currentRequest}
</current_request>`
    };

    return [systemMessage, userMessage];
  }
}
