/**
 * Agent type definitions for the Motia Agent System.
 *
 * This module defines the interfaces and types for Agents,
 * which orchestrate Skills and execute tasks using PTC.
 */

// Export PTCGenerator class for type checking
export { PTCGenerator } from './ptc-generator.js';

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
    /** Whether to enable HITL clarification mechanism (default: true) */
    enable_clarification?: boolean;
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

  /** Knowledge Base configuration for RAG (Retrieval-Augmented Generation) */
  knowledgeBase?: {
    /** PostgreSQL connection configuration */
    db: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      max?: number;
      idleTimeoutMillis?: number;
      connectionTimeoutMillis?: number;
    };
    /** API key for embedding service (OpenAI or compatible) */
    apiKey: string;
    /** Custom base URL for OpenAI-compatible APIs (optional) */
    baseURL?: string;
    /** Embedding model (default: 'text-embedding-3-small') */
    embeddingModel?: string;
    /** Vector dimensions (default: 1536) */
    embeddingDimensions?: number;
  };

  /** Validation Hook configuration for output validation */
  validation?: {
    /** Validation strategy: strict (throws error) or fallback (sanitizes output) */
    strategy?: 'strict' | 'fallback';
    /** Schema validation rules (validates output structure) */
    schema?: Record<string, any>;
    /** Required field paths (dot notation for nested fields) */
    required?: string[];
    /** Format validation rules (regex patterns) */
    formats?: Array<{
      field: string;
      pattern: string | RegExp;
      message?: string;
    }>;
  };
}

/**
 * Configuration for ExternalAgent (extends Agent).
 */
export interface ExternalAgentConfig extends AgentConfig {
  /** External agent configuration (required for ExternalAgent) */
  externalAgent: {
    /** Agent type (claude, codex, gemini, cursor, etc.) */
    type: 'claude' | 'codex' | 'gemini' | 'cursor' | 'pi' | 'openclaw';
    /** Protocol type (acp, stdio) */
    protocol?: 'acp' | 'stdio';
    /** Timeout in milliseconds */
    timeout?: number;
    /** Working directory (optional) */
    workingDirectory?: string;
    /** Additional command-line arguments */
    args?: string[];
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
    /** External agent type (for ExternalAgent) */
    externalAgent?: string;
    /** ACP stop reason (for ExternalAgent) */
    stopReason?: string;
    /** File operations from ExternalAgent (保留用于向后兼容和原始数据访问) */
    fileOperations?: any[];
    [key: string]: any; // Allow additional metadata fields
  };

  /** Structured output from skill execution (at root level, not in metadata) */
  structuredOutput?: any;

  /** All structured outputs from multiple skill executions */
  structuredOutputs?: any[];

  /** ⭐ 统一的产物信息（可选，由 WorkflowEngine 或 Agent 填充） */
  artifacts?: import('./artifacts').AgentArtifacts;

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
  max_tokens?: number;

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

  /** User-specified available skills (must be respected - overrides LLM selection) */
  availableSkills?: string[];

  /** 用户画像（来自跨会话累积） */
  userProfile?: any;

  /** 应用特定上下文（如 AI 女友的角色设定） */
  userContext?: any;

  /** 环境配置（workspace, gitUrl, language 等） */
  environment?: Record<string, any>;

  /** 最近的技能执行记录（用于避免重复错误） */
  recentSkillExecutions?: Array<{
    skillName: string;
    success: boolean;
    timestamp: Date;
    error?: string;
    scenario?: string;
  }>;

  /** 失败经验（用于学习避免重复错误） */
  failureExperiences?: Array<{
    skillName: string;
    scenario: string;
    error: string;
    solution: string;
    frequency: number;
    lastOccurred: Date;
  }>;
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

  /** Confidence score for skill selection (0.0 to 1.0) */
  confidence?: number;
}

/**
 * Delegation plan for MasterAgent.
 */
export interface DelegationPlan {
  /** Selected subagents (from LLM response) */
  selected_subagents?: string[];

  /** Overall confidence score (0-100) */
  confidence?: number;

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

  /** Confidence score for delegation decision (0-100) */
  confidence?: number;

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

/**
 * UserContext - 用户上下文（应用层传入的运行时配置）
 *
 * 这是推荐结构，保持向后兼容，仍接受 Record<string, any>
 *
 * 使用场景：
 * - MyEcho: 传入 AI 角色信息、用户状态、关系数据
 * - 其他应用: 可传入任意应用特定字段
 *
 * 数据流：
 * - 应用层通过 userContext 传入业务特定数据
 * - myagent 通过 UserProfile 维护通用数据（preferences, habits, tags）
 * - ContextManager 将两者格式化进 prompt
 */
export interface UserContext {
  // ========== AI 角色信息（应用特定）==========
  name?: string;              // AI 名字
  personality?: string;       // AI 性格描述
  age?: number;              // AI 年龄

  // ========== 用户信息（通用）==========
  user_mood?: string;        // 用户当前情绪
  user_needs?: string;       // 用户情感需求
  user_style?: string;       // 用户沟通风格

  // ========== 关系信息（应用特定）==========
  intimacy_level?: number;   // 亲密度 (0-10)
  chat_days?: number;        // 相处天数
  nickname?: string;         // 昵称

  // ========== 扩展字段 ==========
  [key: string]: any;
}
