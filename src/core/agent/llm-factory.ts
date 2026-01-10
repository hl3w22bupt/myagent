/**
 * LLM Factory - Create LLM clients based on configuration.
 *
 * Supports multiple LLM providers:
 * - Anthropic (Claude)
 * - OpenAI-compatible (GLM-4, etc.)
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LLMProvider = 'anthropic' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

/**
 * Create LLM client based on provider.
 *
 * @param config - LLM configuration
 * @returns LLM client (Anthropic or OpenAI instance)
 */
export function createLLM(config: LLMConfig): Anthropic | OpenAI {
  const { provider, apiKey, baseURL, model } = config;

  switch (provider) {
    case 'anthropic':
      return new Anthropic({
        apiKey,
        baseURL: baseURL || 'https://api.anthropic.com',
      });

    case 'openai-compatible':
      // For GLM-4 and other OpenAI-compatible APIs
      return new OpenAI({
        apiKey,
        baseURL: baseURL || 'https://open.bigmodel.cn/api/paas/v4/',
        defaultQuery: { model: model || 'glm-4' },
      });

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Get LLM configuration from environment.
 *
 * Uses ANTHROPIC_API_KEY for API key.
 * Uses DEFAULT_LLM_PROVIDER to determine provider type.
 * Uses DEFAULT_LLM_MODEL for model name.
 */
export function getLLMConfigFromEnv(): LLMConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  const provider = (process.env.DEFAULT_LLM_PROVIDER || 'anthropic') as LLMProvider;
  const model = process.env.DEFAULT_LLM_MODEL;
  const baseURL = process.env.LLM_BASE_URL;

  return {
    provider,
    apiKey,
    baseURL,
    model,
  };
}
