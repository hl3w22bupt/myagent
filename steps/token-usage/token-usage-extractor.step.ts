/**
 * Token Usage Extractor Step.
 *
 * Extracts token usage data from execution traces.
 * Subscribes to the execution-traces stream and processes llm_call stages
 * to extract token usage information from LLM responses.
 */

import { type StepConfig, logger, queue, enqueue } from 'motia';
import { executionTraceSchema, ExecutionTrace } from '../streams/execution-traces.stream';
import { TokenUsageRecordedEvent } from './types';

/**
 * Input schema for token usage extractor.
 * Uses the execution trace schema as input.
 */
export const inputSchema = executionTraceSchema;

/**
 * Token Usage Extractor configuration.
 *
 * NOTE: This step needs to be integrated into the execution flow.
 * Current implementation assumes stream-triggered execution, but Motia
 * Event Steps require explicit event subscriptions.
 *
 * TODO: Integrate with execution trace emission or convert to event-driven pattern
 *
 * Emits token_usage_recorded events for downstream processing.
 */
export const config = {
  name: 'token-usage-extractor',
  description: 'Extracts token usage data from execution traces',

  triggers: [
    queue('execution.trace.created'),
  ],

  enqueues: ['token_usage_recorded'] as const,
} as const satisfies StepConfig;

/**
 * Token Usage Extractor handler.
 *
 * Processes execution traces and extracts token usage from LLM calls.
 * Filters for llm_call stage and validates token data before emitting.
 */
export const handler = async (trace: ExecutionTrace) => {
  const { traceId, taskId, agentId, stage, metadata } = trace;

  logger.info('[Token Usage Extractor] Received trace', {
    traceId,
    taskId,
    stage,
    hasMetadata: !!metadata,
  });

  // Filter for LLM call stages only (llm_call, llm_call_execute, llm_call_skill_prompt, etc.)
  if (!stage?.startsWith('llm_call')) {
    logger.debug('[Token Usage Extractor] Skipping non-LLM trace', {
      traceId,
      stage,
    });
    return { extracted: false, reason: 'not_llm_call' };
  }

  // Check if metadata exists and contains LLM response
  if (!metadata?.llmResponse) {
    logger.debug('[Token Usage Extractor] No LLM response in metadata', {
      traceId,
      hasMetadata: !!metadata,
      hasLlmResponse: !!metadata?.llmResponse,
    });
    return { extracted: false, reason: 'no_llm_response' };
  }

  const { llmResponse, llmProvider, llmModel } = metadata;

  // Extract token data
  const { promptTokens, completionTokens, totalTokens } = llmResponse;

  // Validate token counts exist
  if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) {
    logger.warn('[Token Usage Extractor] Incomplete token data', {
      traceId,
      hasPromptTokens: promptTokens !== undefined,
      hasCompletionTokens: completionTokens !== undefined,
      hasTotalTokens: totalTokens !== undefined,
    });
    return { extracted: false, reason: 'incomplete_token_data' };
  }

  // Validate token counts are non-negative
  if (promptTokens < 0 || completionTokens < 0 || totalTokens < 0) {
    logger.warn('[Token Usage Extractor] Invalid token counts (negative)', {
      traceId,
      promptTokens,
      completionTokens,
      totalTokens,
    });
    return { extracted: false, reason: 'negative_token_count' };
  }

  // Consistency check: totalTokens should equal promptTokens + completionTokens
  const expectedTotal = promptTokens + completionTokens;
  if (totalTokens !== expectedTotal) {
    logger.warn('[Token Usage Extractor] Token count inconsistency', {
      traceId,
      promptTokens,
      completionTokens,
      totalTokens,
      expectedTotal,
      difference: totalTokens - expectedTotal,
    });
    // Continue anyway - some providers may report differently
  }

  // Validate provider and model
  if (!llmProvider || !llmModel) {
    logger.warn('[Token Usage Extractor] Missing provider or model', {
      traceId,
      hasProvider: !!llmProvider,
      hasModel: !!llmModel,
    });
    return { extracted: false, reason: 'missing_provider_or_model' };
  }

  // Prepare token usage recorded event to be emitted
  const tokenUsageEvent: TokenUsageRecordedEvent = {
    traceId,           // Idempotency key
    taskId,
    agentId: agentId || undefined,
    skillName: undefined, // TODO: Extract from trace when available
    model: llmModel,
    provider: llmProvider,
    promptTokens,
    completionTokens,
    totalTokens,
    timestamp: trace.timestamp,
  };

  logger.info('[Token Usage Extractor] Token usage extracted', {
    traceId,
    taskId,
    model: llmModel,
    provider: llmProvider,
    promptTokens,
    completionTokens,
    totalTokens,
  });

  // Emit token_usage_recorded event
  await enqueue({
    topic: 'token_usage_recorded',
    data: tokenUsageEvent,
  });
  logger.info('[Token Usage Extractor] Emitted token_usage_recorded event', {
    traceId,
    taskId,
  });

  return tokenUsageEvent;
};
