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
  /** System prompt for the Agent */
  systemPrompt: string;

  /** List of skills this Agent can use */
  availableSkills: string[];

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
  };
}

/**
 * Configuration for MasterAgent (extends Agent).
 */
export interface MasterAgentConfig extends AgentConfig {
  /** List of subagent names this MasterAgent can delegate to */
  subagents: string[];
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
 * Result from executing an Agent.
 */
export interface AgentResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Output data if successful */
  output?: any;

  /** Error message if failed */
  error?: string;

  /** Execution steps taken */
  steps: AgentStep[];

  /** Total execution time in milliseconds */
  executionTime: number;

  /** Execution metadata */
  metadata: {
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
  };

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
  type: 'planning' | 'ptc-generation' | 'execution' | 'delegation' | 'error';

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
