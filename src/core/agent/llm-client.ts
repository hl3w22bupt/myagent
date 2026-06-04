/**
 * Re-export the unified LLMClient from core/llm
 *
 * This maintains backward compatibility with existing imports
 */

export { LLMClient, LLMPresets } from '../llm/client.js';
export type {
  LLMClientConfig,
  LLMMessage,
  LLMResponse,
  LLMProvider,
} from '../llm/client.js';
