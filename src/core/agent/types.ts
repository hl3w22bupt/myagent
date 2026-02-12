/**
 * Agent type definitions for the Motia Agent System.
 *
 * This module defines the interfaces and types for Agents,
 * which orchestrate Skills and execute tasks using PTC.
 */

// Export PTCGenerator class for type checking
export { PTCGenerator } from './ptc-generator';

/**
 * Configuration for creating an Agent.
 */
export interface AgentConfig {
  /** Optional display name for the Agent (used for trace display) */
  name?: string;

  /** System prompt for the Agent */
  systemPrompt: string;

  /** List of skills this Agent can use (optional = all available skills) */
  availableSkills?: string[];

  /** LLM configuration */
  llm?: {
    provider: string;
    model: string;
    apiKey?: string;
    baseURL?: string;
  };

  /** Sandbox configuration */
  sandbox?: {
    type: string;
    config?: any;
    local?: any;
    daytona?: any;
    e2b?: any;
    modal?: any;
  };

  /** Execution constraints */
  constraints?: {
    maxIterations?: number;
    timeout?: number;
    /** Retry configuration for failed operations */
    retry?: {
      /** Maximum number of retry attempts (default: 3) */
      maxRetries?: number;
      /** Base delay in milliseconds (default: 1000) */
      baseDelay?: number;
      /** Maximum delay in milliseconds (default: 30000) */
      maxDelay?: number;
      /** Whether to use exponential backoff (default: true) */
      exponentialBackoff?: boolean;
      /** Custom retryable error checker */
      isRetryable?: (error: Error) => boolean;
    };
  };
}

/**
 * Configuration for MasterAgent (extends Agent).
 */
export interface MasterAgentConfig extends AgentConfig {
  /** List of subagent names this MasterAgent can delegate to */
  subagents: string[];

  /** Optional: Specific subagents to delegate to (bypasses intelligent analysis) */
  delegateTo?: string[];
}

/**
 * Session state for an Agent instance.
 */
export interface SessionState {
  /** Session identifier */
  sessionId: string;

  /** Session creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Conversation history */
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;

  /** Execution history */
  executionHistory: Array<{
    task: string;
    result: any;
    timestamp: number;
    executionTime: number;
  }>;

  /** Intermediate variables */
  variables: Map<string, any>;
}

/**
 * Clarification information for HITL (Human-in-the-Loop).
 */
export interface ClarificationInfo {
  /** Whether clarification is needed */
  needs: boolean;

  /** Question to ask the user (required when needs=true) */
  question?: string;

  /** Optional predefined choices for the user */
  options?: string[];

  /** Stage where clarification is requested (for debugging) */
  stage: 'pre_intent' | 'post_intent' | 'in_execution';
}

/**
 * Result from executing an Agent.
 */
export interface AgentResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Output data if successful */
  output?: any;

  /** Error message if failed */
  error?: string;

  /** HITL clarification information (if awaiting user input) */
  clarification?: ClarificationInfo;

  /** Execution steps taken */
  steps: AgentStep[];

  /** Total execution time in milliseconds */
  executionTime: number;

  /** Execution metadata */
  metadata: {
    skillNames?: string[];
    /** Subagents that were delegated to (for MasterAgent) */
    delegates?: string[];
    /** Artifact type from skill output (e.g., 'video', 'image', 'code') */
    artifactType?: string;
    /** Sandbox execution retry information */
    retries?: {
      /** Number of retry attempts */
      attempts: number;
      /** Total time spent in retries (milliseconds) */
      totalDelay: number;
      /** Whether the last attempt was successful after retries */
      recovered: boolean;
    };
    /** PTC generation retry information */
    ptcRetries?: {
      /** Number of retry attempts */
      attempts: number;
      /** Total time spent in retries (milliseconds) */
      totalDelay: number;
      /** Whether the last attempt was successful after retries */
      recovered: boolean;
    };
    /** HITL flag - indicates if task was paused for clarification */
    hitl?: boolean;
  };

  /** Structured output from skill execution (at root level, not in metadata) */
  structuredOutput?: any;

  /** Session ID (optional for backward compatibility) */
  sessionId?: string;

  /** Session state information (optional) */
  state?: {
    conversationLength: number;
    executionCount: number;
    variablesCount: number;
  };
}

/**
 * A single step in Agent execution.
 */
export interface AgentStep {
  /** Step type */
  type: 'planning' | 'ptc-generation' | 'execution' | 'delegation' | 'error' | 'hitl_checkpoint';

  /** Step content (can be PTC code, plan, etc.) */
  content: string;

  /** Timestamp when step was executed */
  timestamp: number;

  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Options for PTC generation.
 */
export interface PTCGenerationOptions {
  /** Whether to include reasoning in generated code */
  includeReasoning?: boolean;

  /** Maximum tokens for LLM response */
  maxTokens?: number;

  /** Temperature for LLM */
  temperature?: number;

  /** Conversation history for context */
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;

  /** Variables available for reference */
  variables?: Record<string, any>;

  /** Original task (for multi-turn conversations) */
  originalTask?: string;
}

/**
 * Result from PTC generation.
 */
export interface PTCResult {
  /** Generated Python PTC code */
  code: string;

  /** Skills selected for execution */
  selectedSkills: string[];

  /** Reasoning for skill selection */
  reasoning?: string;
}

/**
 * Delegation plan for MasterAgent.
 */
export interface DelegationPlan {
  /** Steps in the plan */
  steps: DelegationStep[];

  /** Overall reasoning for the plan */
  reasoning: string;
}

/**
 * A single step in a delegation plan.
 */
export interface DelegationStep {
  /** Task description */
  task: string;

  /** Subagent to delegate to (undefined = execute self) */
  delegateTo?: string;

  /** Reasoning for this step */
  reason: string;
}

/**
 * Subagent configuration.
 */
export interface SubagentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  availableSkills: string[];
  constraints?: {
    maxIterations?: number;
    timeout?: number;
  };
}
