/**
 * Execution Traces Stream.
 *
 * Real-time stream for tracking detailed execution traces across
 * Task, Agent, and Skill levels. Provides hierarchical tracing with
 * input/output recording, error tracking, retry counts, and timing data.
 */

import { Stream, type StreamConfig } from 'motia';
import { z } from 'zod';

/**
 * Execution trace entry schema.
 * Represents a single execution trace at any level (task/agent/skill).
 */
export const executionTraceSchema = z.object({
  /**
   * Unique trace ID (format: {level}-{taskId|agentId|skillId}-{timestamp})
   */
  traceId: z.string(),

  /**
   * Trace level: task, agent, skill, tool-call, agent-internal, skill-internal
   * - task: Task level traces (task execution lifecycle)
   * - agent: Agent level traces (agent execution lifecycle)
   * - skill: Skill level traces (skill execution lifecycle)
   * - tool-call: Tool call traces (LLM-initiated tool-* skill calls)
   * - agent-internal: Agent internal stages (intent analysis, PTC planning)
   * - skill-internal: Skill internal stages (LLM reasoning, generation)
   */
  level: z.enum(['task', 'agent', 'skill', 'tool-call', 'agent-internal', 'skill-internal']),

  /**
   * Task ID (root level identifier)
   */
  taskId: z.string(),

  /**
   * Agent ID (only for agent and skill level traces)
   */
  agentId: z.string().optional(),

  /**
   * Skill name (only for skill level traces)
   */
  skillName: z.string().optional(),

  /**
   * Parent trace ID (for hierarchical relationships)
   * - Task traces: no parent
   * - Agent traces: parent is the task trace ID
   * - Skill traces: parent is the agent trace ID
   */
  parentTraceId: z.string().optional(),

  /**
   * Execution stage
   * - pre: Before execution starts
   * - processing: During execution
   * - post: After execution completes
   * - intent_analysis: Agent intent analysis phase
   * - ptc_planning: Agent PTC code planning phase
   * - llm_call: LLM reasoning phase (both agent and skill)
   * - skill_generation: Skill generation phase (prompt-based skills)
   */
  stage: z.enum(['pre', 'processing', 'post', 'intent_analysis', 'ptc_planning', 'llm_call', 'skill_generation']),

  /**
   * Purpose of the execution (optional, provides more context about the specific operation)
   * e.g., "ptc codegen", "delegation planning", "skill selection"
   */
  purpose: z.string().optional(),

  /**
   * Execution status: started, running, completed, failed, retried
   */
  status: z.enum(['started', 'running', 'completed', 'failed', 'retried']),

  /**
   * Input data (JSON stringified)
   */
  inputData: z.string().optional(),

  /**
   * Output data (JSON stringified)
   */
  outputData: z.string().optional(),

  /**
   * Error message (if failed)
   */
  error: z.string().optional(),

  /**
   * Error stack trace (if failed)
   */
  errorStack: z.string().optional(),

  /**
   * Number of retries (for failed executions)
   */
  retryCount: z.number().default(0),

  /**
   * Maximum retries allowed
   */
  maxRetries: z.number().default(3),

  /**
   * Execution time in milliseconds
   */
  executionTime: z.number().optional(),

  /**
   * Timestamp of trace creation
   */
  timestamp: z.string(),

  /**
   * Additional metadata
   */
  metadata: z.object({
    /**
     * LLM call count
     */
    llmCalls: z.number().optional(),

    /**
     * Skill call count
     */
    skillCalls: z.number().optional(),

    /**
     * Total tokens used
     */
    totalTokens: z.number().optional(),

    /**
     * Session ID for multi-turn conversations
     */
    sessionId: z.string().optional(),

    /**
     * Any additional data
     */
    data: z.any().optional(),

    /**
     * LLM provider (anthropic, openai-compatible, etc.)
     */
    llmProvider: z.string().optional(),

    /**
     * LLM model name
     */
    llmModel: z.string().optional(),

    /**
     * LLM request details (for llm_call traces)
     */
    llmRequest: z.object({
      messages: z.array(z.object({
        role: z.string(),
        content: z.string(),
      })).optional(),
      maxTokens: z.number().optional(),
      temperature: z.number().optional(),
    }).optional(),

    /**
     * LLM response details (for llm_call traces)
     */
    llmResponse: z.object({
      content: z.string().optional(),
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    }).optional(),
  }).optional(),
});

export type ExecutionTrace = z.infer<typeof executionTraceSchema>;

/**
 * Execution Traces Stream configuration.
 */
export const config: StreamConfig = {
  name: 'executionTraces',
  schema: executionTraceSchema as any,
  baseConfig: { storageType: 'default' },
};

export const executionTracesStream = new Stream(config);
