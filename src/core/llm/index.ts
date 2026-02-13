/**
 * LLM Module - Unified LLM Client and Factory
 *
 * Exports:
 * - LLMClient: Main LLM client class
 * - LLMPresets: Preset configurations
 * - LLMClientFactory: Factory for creating LLMClient instances
 * - Types: All LLM-related types
 */

export { LLMClient, LLMPresets } from './client';
export { LLMClientFactory, getLLMClientFactory } from './factory';

export type {
  LLMClientConfig,
  LLMMessage,
  LLMResponse,
  LLMProvider,
} from './client';

export type {
  LLMFactoryConfig,
  LLMTraceConfig,
} from './factory';
