/**
 * Sandbox type definitions for the Motia Agent System.
 *
 * This module defines the interfaces and types for Sandbox execution,
 * which provides isolated Python execution environments for PTC code.
 */

/**
 * Options for executing code in a Sandbox.
 */
export interface SandboxOptions {
  /** List of available skills (metadata only, for lightweight passing) */
  skills: SkillManifest[];

  /** Path to skill implementation directory */
  skillImplPath?: string;

  /** Execution timeout in milliseconds */
  timeout?: number;

  /** Optional session ID for tracking */
  sessionId?: string;

  /** Working directory for execution */
  workspace?: string;

  /** Optional metadata for tracing and debugging */
  metadata?: Record<string, any>;

  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Lightweight skill manifest for passing to Sandbox.
 * Contains only the essential information needed.
 */
export interface SkillManifest {
  name: string;
  version: string;
  type: 'pure-prompt' | 'pure-script' | 'hybrid';
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

/**
 * Result from executing code in a Sandbox.
 */
export interface SandboxResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Output data if successful */
  output?: any;

  /** Error details if failed */
  error?: SandboxError;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Session ID for this execution */
  sessionId: string;

  /** Standard output from the process */
  stdout?: string;

  /** Standard error from the process */
  stderr?: string;
}

/**
 * Error information from Sandbox execution.
 */
export interface SandboxError {
  /** Type of error */
  type: 'timeout' | 'execution' | 'validation' | 'unknown';

  /** Human-readable error message */
  message: string;

  /** Stack trace if available */
  stack?: string;
}

/**
 * Information about a Sandbox adapter.
 */
export interface SandboxInfo {
  /** Adapter type identifier */
  type: string;

  /** Adapter version */
  version: string;

  /** List of supported capabilities */
  capabilities: string[];
}

/**
 * Configuration for a Sandbox adapter.
 */
export interface SandboxAdapterConfig {
  type: string;
  [key: string]: any;
}

/**
 * Configuration for Local Sandbox adapter.
 */
export interface LocalSandboxConfig {
  pythonPath?: string;
  timeout?: number;
  workspace?: string;
  maxSessions?: number;
}

/**
 * Configuration for Daytona Sandbox adapter (future).
 */
export interface DaytonaSandboxConfig {
  apiKey?: string;
  template?: string;
}

/**
 * Configuration for E2B Sandbox adapter (future).
 */
export interface E2BSandboxConfig {
  apiKey?: string;
  template?: string;
}

/**
 * Configuration for Modal Sandbox adapter (future).
 */
export interface ModalSandboxConfig {
  token?: string;
  functionId?: string;
}

/**
 * Union type for all Sandbox configurations.
 */
export type SandboxConfig = SandboxAdapterConfig & {
  local?: LocalSandboxConfig;
  daytona?: DaytonaSandboxConfig;
  e2b?: E2BSandboxConfig;
  modal?: ModalSandboxConfig;
};

/**
 * Sandbox Adapter Interface.
 *
 * All Sandbox implementations must implement this interface.
 */
export interface SandboxAdapter {
  /**
   * Execute code in the Sandbox.
   *
   * @param code - PTC Python code to execute
   * @param options - Execution options
   * @returns Promise resolving to execution result
   */
  execute(code: string, options: SandboxOptions): Promise<SandboxResult>;

  /**
   * Cleanup resources.
   *
   * @param sessionId - Optional session ID to cleanup.
   *                  If not provided, cleanup all sessions.
   */
  cleanup(sessionId?: string): Promise<void>;

  /**
   * Check if the Sandbox is healthy.
   *
   * @returns Promise resolving to true if healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get information about this Sandbox adapter.
   *
   * @returns SandboxInfo object
   */
  getInfo(): SandboxInfo;
}
