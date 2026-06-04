/**
 * LLM Module - Unified LLM Client and Factory
 *
 * Exports:
 * - LLMClient: Main LLM client class
 * - LLMPresets: Preset configurations
 * - LLMClientFactory: Factory for creating LLMClient instances
 * - Types: All LLM-related types
 */

export { LLMClient, LLMPresets } from './client.js';
export { LLMClientFactory, getLLMClientFactory } from './factory.js';

export type {
  LLMClientConfig,
  LLMMessage,
  LLMResponse,
  LLMProvider,
} from './client.js';

export type {
  LLMFactoryConfig,
  LLMTraceConfig,
} from './factory.js';
