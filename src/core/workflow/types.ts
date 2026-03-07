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

// Workflow step
export interface WorkflowStep {
  id: string;
  name?: string;
  agent: string;
  type?: 'agent' | 'subworkflow';
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
