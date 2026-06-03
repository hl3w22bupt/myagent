/**
 * LLM Client Factory - 统一的 LLMClient 创建和配置管理
 *
 * 解决问题：
 * 1. 统一 LLMClient 创建方式（避免在多处 new LLMClient()）
 * 2. 统一 trace 配置（确保所有 LLM 调用都能记录 trace）
 * 3. 支持从环境变量和配置文件读取
 * 4. 支持动态更新 trace 配置（streams 和 traceContext）
 */

import { LLMClient, LLMClientConfig, LLMPresets } from './client.js';
import { getAgentStreams } from '../agent/hooks/progress-notify.js';

/**
 * 全局 trace 配置接口
 */
export interface LLMTraceConfig {
  /** Streams 接口（用于发送 execution traces） */
  streams?: {
    executionTraces?: {
      set(groupId: string, id: string, data: any): Promise<any>;
    };
  };
  /** Trace 上下文信息 */
  traceContext?: {
    taskId?: string;
    agentId?: string;
    skillName?: string;
  };
}

/**
 * LLMClient 工厂配置
 */
export interface LLMFactoryConfig {
  /** LLM provider 配置 */
  provider?: 'anthropic' | 'openai-compatible';
  /** API Key */
  apiKey?: string;
  /** Base URL（自定义 API endpoint） */
  baseURL?: string;
  /** 模型名称 */
  model?: string;
  /** Trace 配置 */
  traceConfig?: LLMTraceConfig;
}

/**
 * LLMClient 工厂类
 *
 * 提供：
 * 1. 统一的 LLMClient 创建接口
 * 2. 全局 trace 配置管理
 * 3. 环境变量自动读取
 */
export class LLMClientFactory {
  private static globalTraceConfig: LLMTraceConfig = {};

  /**
   * 设置全局 trace 配置
   * 所有后续创建的 LLMClient 都会使用此配置
   *
   * @param traceConfig - Trace 配置
   */
  static setGlobalTraceConfig(traceConfig: LLMTraceConfig): void {
    LLMClientFactory.globalTraceConfig = traceConfig;
    console.log('[LLMClientFactory] Global trace config updated:', {
      hasStreams: !!traceConfig.streams,
      hasTaskId: !!traceConfig.traceContext?.taskId,
      hasAgentId: !!traceConfig.traceContext?.agentId,
    });
  }

  /**
   * 更新全局 trace 配置的部分字段
   *
   * @param updates - 要更新的字段
   */
  static updateGlobalTraceConfig(updates: Partial<LLMTraceConfig>): void {
    LLMClientFactory.globalTraceConfig = {
      ...LLMClientFactory.globalTraceConfig,
      ...updates,
    };
    console.log('[LLMClientFactory] Global trace config updated with:', updates);
  }

  /**
   * 清除全局 trace 配置
   */
  static clearGlobalTraceConfig(): void {
    LLMClientFactory.globalTraceConfig = {};
    console.log('[LLMClientFactory] Global trace config cleared');
  }

  /**
   * 获取当前全局 trace 配置
   */
  static getGlobalTraceConfig(): LLMTraceConfig {
    return LLMClientFactory.globalTraceConfig;
  }

  /**
   * 从环境变量读取 LLM 配置
   *
   * 优先级：
   * 1. 显式传入的 config
   * 2. 环境变量
   * 3. 默认值
   */
  private static resolveConfig(config?: LLMFactoryConfig): LLMFactoryConfig {
    const provider = config?.provider ||
      (process.env.DEFAULT_LLM_PROVIDER as 'anthropic' | 'openai-compatible') ||
      'anthropic';

    const apiKey = config?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';

    const baseURL = config?.baseURL || process.env.LLM_BASE_URL;

    const model = config?.model || process.env.DEFAULT_LLM_MODEL;

    return {
      provider,
      apiKey,
      baseURL,
      model,
      traceConfig: config?.traceConfig || LLMClientFactory.globalTraceConfig,
    };
  }

  /**
   * 创建 LLMClient（使用预设配置）
   *
   * @param preset - 预设配置（'claude', 'glm47-anthropic' 等）
   * @param config - 可选的自定义配置（覆盖预设）
   * @returns LLMClient 实例
   */
  static createFromPreset(
    preset: 'claude' | 'glm47-anthropic' | 'glm4-openai' | 'openai',
    config?: Partial<LLMFactoryConfig>
  ): LLMClient {
    const resolvedConfig = LLMClientFactory.resolveConfig(config);

    let presetConfig: LLMClientConfig;

    switch (preset) {
      case 'claude':
        presetConfig = LLMPresets.claude(
          resolvedConfig.apiKey!,
          resolvedConfig.model
        );
        break;
      case 'glm47-anthropic':
        presetConfig = LLMPresets.glm47Anthropic(
          resolvedConfig.apiKey!,
          resolvedConfig.model
        );
        break;
      case 'glm4-openai':
        presetConfig = LLMPresets.glm4OpenAI(
          resolvedConfig.apiKey!,
          resolvedConfig.model
        );
        break;
      case 'openai':
        presetConfig = LLMPresets.openai(
          resolvedConfig.apiKey!,
          resolvedConfig.model
        );
        break;
      default:
        throw new Error(`Unknown preset: ${preset}`);
    }

    // 合并全局 trace 配置
    const clientConfig: LLMClientConfig = {
      ...presetConfig,
      streams: resolvedConfig.traceConfig?.streams,
      traceContext: resolvedConfig.traceConfig?.traceContext,
    };

    console.log('[LLMClientFactory] Creating LLMClient with preset:', {
      preset,
      provider: clientConfig.provider,
      model: clientConfig.model,
      hasTrace: !!clientConfig.streams,
      taskId: clientConfig.traceContext?.taskId,
    });

    return new LLMClient(clientConfig);
  }

  /**
   * 创建 LLMClient（使用自定义配置）
   *
   * @param config - 完整的 LLM 配置
   * @returns LLMClient 实例
   */
  static create(config: LLMFactoryConfig): LLMClient {
    const resolvedConfig = LLMClientFactory.resolveConfig(config);

    const clientConfig: LLMClientConfig = {
      provider: resolvedConfig.provider || 'anthropic',
      apiKey: resolvedConfig.apiKey || '',
      baseURL: resolvedConfig.baseURL,
      model: resolvedConfig.model,
      streams: resolvedConfig.traceConfig?.streams,
      traceContext: resolvedConfig.traceConfig?.traceContext,
    };

    console.log('[LLMClientFactory] Creating LLMClient with custom config:', {
      provider: clientConfig.provider,
      model: clientConfig.model,
      hasTrace: !!clientConfig.streams,
      taskId: clientConfig.traceContext?.taskId,
    });

    return new LLMClient(clientConfig);
  }

  /**
   * 创建用于 Agent 的 LLMClient
   *
   * 从 AgentConfig 读取 LLM 配置，并自动添加 trace 支持
   *
   * @param agentConfig - Agent 配置（包含 llm 字段）
   * @returns LLMClient 实例
   */
  static createForAgent(agentConfig: { llm?: any }): LLMClient {
    const llmConfig = agentConfig.llm || {};

    // ✅ 动态获取当前可用的 streams（而不是依赖可能为空的全局配置）
    const currentStreams = getAgentStreams();

    const config: LLMFactoryConfig = {
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL,
      model: llmConfig.model,
      traceConfig: currentStreams ? {
        streams: currentStreams,
      } : {},
    };

    console.log('[LLMClientFactory] Creating LLMClient for agent with trace config:', {
      hasStreams: !!currentStreams,
      hasTaskId: !!(config.traceConfig as any).traceContext?.taskId,
    });

    return LLMClientFactory.create(config);
  }

  /**
   * 创建用于摘要的 LLMClient（无 trace）
   *
   * 摘要操作不需要 trace，避免污染 execution traces
   *
   * @param config - 可选的配置
   * @returns LLMClient 实例
   */
  static createForSummarizer(config?: LLMFactoryConfig): LLMClient {
    const resolvedConfig = LLMClientFactory.resolveConfig(config);

    // 摘要不使用 trace
    const clientConfig: LLMClientConfig = {
      provider: resolvedConfig.provider || 'anthropic',
      apiKey: resolvedConfig.apiKey || '',
      baseURL: resolvedConfig.baseURL,
      model: resolvedConfig.model || 'claude-sonnet-4-5',
      // 不设置 streams 和 traceContext
    };

    console.log('[LLMClientFactory] Creating LLMClient for summarizer (no trace)');

    return new LLMClient(clientConfig);
  }

  /**
   * 更新现有 LLMClient 的 trace 配置
   *
   * 用于动态更新已创建的 LLMClient 实例
   *
   * @param client - LLMClient 实例
   * @param traceConfig - 新的 trace 配置
   */
  static updateClientTraceConfig(
    client: LLMClient,
    traceConfig: LLMTraceConfig
  ): void {
    if (!traceConfig.streams && !traceConfig.traceContext) {
      return;
    }

    // 直接修改 LLMClient 的私有属性
    (client as any).streams = traceConfig.streams;
    (client as any).traceContext = traceConfig.traceContext;

    console.log('[LLMClientFactory] Updated client trace config:', {
      hasStreams: !!traceConfig.streams,
      hasTaskId: !!traceConfig.traceContext?.taskId,
      hasAgentId: !!traceConfig.traceContext?.agentId,
      hasSkillName: !!traceConfig.traceContext?.skillName,
    });
  }

  /**
   * 为 Agent 更新 LLMClient trace 配置
   *
   * @param client - LLMClient 实例
   * @param taskId - 任务 ID
   * @param agentId - Agent ID（通常是 sessionId）
   * @param skillName - 可选的 skill 名称
   */
  static updateAgentTraceConfig(
    client: LLMClient,
    taskId: string,
    agentId: string,
    skillName?: string
  ): void {
    const streams = LLMClientFactory.globalTraceConfig.streams;

    if (!streams || !taskId) {
      console.warn('[LLMClientFactory] Cannot update trace config: missing streams or taskId');
      return;
    }

    LLMClientFactory.updateClientTraceConfig(client, {
      streams: LLMClientFactory.globalTraceConfig.streams,
      traceContext: {
        taskId,
        agentId,
        skillName,
      },
    });
  }
}

/**
 * 获取全局 LLMClientFactory 实例（用于访问 trace 配置）
 */
export function getLLMClientFactory(): typeof LLMClientFactory {
  return LLMClientFactory;
}
