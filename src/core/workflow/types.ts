/**
 * Workflow Engine Types
 */

// Workflow step output mapping
export interface OutputMapping {
  from: string;
  default?: any;
}

// Workflow step condition
export interface StepCondition {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in';
  value: any;
}

/**
 * Validation Rule Format
 */
export interface ValidationFormatRule {
  field: string;
  pattern: string | RegExp;
  message?: string;
}

/**
 * Step-level Validation Configuration
 */
export interface StepValidation {
  /** Validation strategy: strict (throws error) or fallback (sanitizes output) */
  strategy?: 'strict' | 'fallback';

  /** Schema validation using Zod-like structure */
  schema?: Record<string, any>;

  /** Required fields */
  required?: string[];

  /** Format validation rules */
  formats?: ValidationFormatRule[];
}

export interface MultiCondition {
  all?: StepCondition[];
  any?: StepCondition[];
  none?: StepCondition[];
}

// Loop configuration
export interface LoopConfig {
  while?: StepCondition;
  max_iterations?: number;
  break_on?: StepCondition;
}

// Parallel execution configuration
export interface ParallelConfig {
  iterations: Array<Record<string, any>>;
  concurrency?: number;
  merge_strategy?: 'collect' | 'merge' | 'overwrite' | 'append';
  merge_to?: string;
}

// ⭐ Feedback Loop Configuration

/**
 * Retry Configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts (default: 0, no retry) */
  maxRetries?: number;

  /** Delay before retry in milliseconds (default: 1000) */
  delayMs?: number;

  /** Use exponential backoff (default: true) */
  exponentialBackoff?: boolean;

  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;

  /** Jitter factor 0-1 (default: 0.1) */
  jitterFactor?: number;

  /** Custom retryable error checker (optional) */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Failure Handler Strategy
 */
export type FailureHandler =
  | 'retry'        // Retry using retry config
  | 'skip'         // Skip this step, continue to next
  | 'rollback'     // Rollback to specified step
  | 'hitl';        // Request Human-In-The-Loop

/**
 * Rollback Configuration
 */
export interface RollbackConfig {
  /** Target step ID to rollback to */
  targetStepId: string;

  /** Clear context before rollback (default: false) */
  clearContext?: boolean;

  /** Reset retry counters (default: true) */
  resetRetries?: boolean;
}

/**
 * HITL (Human-In-The-Loop) Configuration
 */
export interface HITLConfig {
  /** HITL timeout in milliseconds (default: 7 days) */
  timeout?: number;

  /** Polling interval in milliseconds (default: 10000 = 10s) */
  pollInterval?: number;

  /** Options for human decision maker */
  options?: HITLOption[];

  /** Question to ask human (optional, auto-generated if not provided) */
  question?: string;

  /** Additional context for human (optional) */
  context?: Record<string, any>;
}

/**
 * HITL Option
 */
export interface HITLOption {
  /** Option ID */
  id: string;

  /** Display label */
  label: string;

  /** Option description */
  description?: string;

  /** Action to execute if this option is selected */
  action: 'retry' | 'skip' | 'rollback' | 'abort';

  /** Action parameters */
  params?: Record<string, any>;

  /** Style hint for UI (optional) */
  style?: 'primary' | 'secondary' | 'danger' | 'warning';
}

/**
 * HITL Step Configuration (explicit human-in-the-loop step)
 */
export interface HITLStepConfig {
  /** Question to ask human */
  question: string;

  /** Context configuration */
  context?: {
    /** Show output from previous step */
    from_step?: string;
    /** Only show specific fields from the output */
    show_fields?: string[];
  };

  /** Options for human to choose from */
  options: HITLStepOption[];
}

/**
 * HITL Step Option
 */
export interface HITLStepOption {
  /** Option ID */
  id: string;

  /** Display label */
  label: string;

  /** Option description */
  description?: string;

  /** Action to execute if this option is selected */
  action: 'continue' | 'abort' | 'retry';

  /** Style hint for UI (optional) */
  style?: 'primary' | 'secondary' | 'danger' | 'warning';

  /** When action='retry', which step to retry (defaults to current step) */
  retry_step?: string;

  /** Set context variables for subsequent steps */
  set_context?: Record<string, any>;

  /** Allow user to modify output before continuing */
  allow_modify?: boolean;
}

/**
 * External Agent Configuration for Workflow Steps
 */
export interface ExternalAgentConfig {
  /** Agent type: claude, codex, cursor, openclaw, pi, gemini */
  type: string;

  /** Protocol: acp (Agent Client Protocol) or stdio */
  protocol?: 'acp' | 'stdio';

  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;

  /** Working directory for the external agent (optional) */
  workingDirectory?: string;

  /** Additional command-line arguments (optional) */
  args?: string[];
}

/**
 * Git Clone Step Configuration (when type='git-clone')
 */
export interface GitCloneConfig {
  /** Repository URL (supports {{ environment.githubUrl }} template) */
  url: string;

  /** Authentication token (supports {{ environment.githubToken }} template) */
  token?: string;

  /** Branch to checkout (optional, defaults to repo's default branch) */
  branch?: string;

  /** Target directory name within workspace (optional, defaults to repo name) */
  targetDir?: string;

  /**
   * Use git worktree when target directory already exists (default: true).
   * When true and the repo already exists, creates a new worktree with a
   * branch name derived from the task content.
   * Set to false to work directly in the existing repo.
   */
  useWorktree?: boolean;
}

// Workflow step
export interface WorkflowStep {
  id: string;
  name?: string;
  agent?: string;  // Made optional since hitl steps don't require an agent
  type?: 'agent' | 'subworkflow' | 'hitl' | 'git-clone';
  subworkflow?: string;
  depends_on?: string[];
  input?: Record<string, any>;
  output?: Record<string, string | OutputMapping>;
  timeout?: number;
  condition?: StepCondition;
  conditions?: MultiCondition;
  parallel?: ParallelConfig;
  loop?: LoopConfig;
  next_step?: string;
  max_iterations?: number;
  always_run?: boolean;

  /** External agent configuration (if using external agent) */
  externalAgent?: ExternalAgentConfig;

  /** Git clone step configuration (when type='git-clone') */
  gitClone?: GitCloneConfig;

  // ⭐ Feedback Loop Configuration
  /** Retry configuration for automatic retries on failure */
  retry?: RetryConfig;

  /** Failure handling strategy */
  on_failure?: FailureHandler;

  /** Step-level validation configuration (primary source for validation rules) */
  validation?: StepValidation;

  /** Rollback configuration (used when on_failure is 'rollback') */
  rollbackConfig?: RollbackConfig;

  /** HITL configuration (used when on_failure is 'hitl') */
  hitl?: HITLConfig;

  /** ⭐ HITL step configuration (when type='hitl') */
  hitlStep?: HITLStepConfig;
}

// Input/Output schema
export interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: any;
  description?: string;
}

export interface WorkflowConfig {
  name: string;
  description?: string;
  version?: string;
  input_schema?: Record<string, SchemaProperty>;
  output_schema?: Record<string, SchemaProperty>;
  output?: Record<string, string | OutputMapping>;  // Final output mapping from intermediate variables
  defaults?: Record<string, any>;
  error_handler?: string;
  steps: WorkflowStep[];
}

// Workflow execution options
export interface WorkflowOptions {
  taskId?: string;
  sessionId?: string;
  timeout?: number;
  dryRun?: boolean;
  parentContext?: any;
  parentSessionId?: string;

  /** Step ID to resume execution from (skips all prior steps) */
  resumeFrom?: string;

  /** Previous task ID to load context/state from */
  previousTaskId?: string;

  /** Feedback or instructions for the resumed workflow */
  feedback?: string;
}

// Workflow execution result
export interface WorkflowResult {
  success: boolean;
  output?: Record<string, any>;
  error?: string;
  executionTime: number;
  steps: WorkflowExecutionStep[];
  context?: Record<string, any>;
}

// Workflow execution step result
export interface WorkflowExecutionStep {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  executionTime?: number;
  reason?: string;
  loopBreak?: boolean;
}

// Workflow context (internal state)
export interface WorkflowContextState {
  input: Record<string, any>;
  output: Record<string, any>;
  variables: Record<string, any>;  // Intermediate variables
  loop: {
    index?: number;
    iteration?: any;
    totalIterations?: number;
  };
  stepStatus: Record<string, 'completed' | 'failed' | 'skipped'>;
}

// Validation error
export interface ValidationError {
  stepId: string;
  field: string;
  error: string;
}
