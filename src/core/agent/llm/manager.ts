/**
 * LLM Client Manager
 *
 * 统一管理所有 LLMClient 的创建和配置
 * 确保 trace 功能在所有地方一致启用
 */

import { LLMClientFactory, LLMFactoryConfig, LLMTraceConfig } from '../../llm/factory';
import { LLMClient } from '../../llm/client';
import { getAgentStreams } from '../../agent/hooks/progress-notify';

export class LLMClientManager {
  private factory: LLMClientFactory;
  private config: LLMFactoryConfig;

  constructor(factory: LLMClientFactory, config?: LLMFactoryConfig) {
    this.factory = factory;
    this.config = config || {};
  }

  /**
   * Create a new LLM client with trace enabled
   * @param agentInfo - Agent info for trace context
   * @returns LLM client instance
   */
  createClient(agentInfo: { sessionId: string; agentId: string }): LLMClient {
    const agentStreams = getAgentStreams();

    // Build trace config matching LLMTraceConfig structure
    const traceConfig: LLMTraceConfig = {
      streams: agentStreams?.executionTraces
        ? { executionTraces: agentStreams.executionTraces }
        : undefined,
      traceContext: {
        taskId: agentInfo.sessionId,
        agentId: agentInfo.agentId,
      },
    };

    const clientConfig: LLMFactoryConfig = {
      ...this.config,
      traceConfig,
    };

    const llmClient = LLMClientFactory.create(clientConfig);

    console.log(`[LLMManager] Created LLM client with trace config:`, !!traceConfig.streams);

    return llmClient;
  }
}
