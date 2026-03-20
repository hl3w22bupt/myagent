/**
 * Soul Agent type definitions
 *
 * Defines types for autonomous Soul agents that can run continuously
 * with hibernation/wakeup capabilities.
 */

/**
 * Soul configuration from soul.yaml file
 */
export interface SoulConfig {
  /** Unique soul identifier */
  soul_id: string;

  /** Display name */
  display_name: string;

  /** Reference to subagent name */
  subagent: string;

  /** Long-term goal that defines the soul's purpose */
  goal: string;

  /** Available primitives (universal across all souls) */
  primitives: string[];

  /** Hibernation configuration */
  hibernation: {
    /** Idle timeout before hibernating (milliseconds) */
    idle_timeout: number;
  };
}

/**
 * Soul runtime state (managed by SoulScheduler)
 */
export interface SoulState {
  /** Current status */
  status: 'ACTIVE' | 'HIBERNATED' | 'IDLE' | 'STOPPED';

  /** Current task identifier */
  currentTask: string | null;

  /** Last activity timestamp */
  lastActivity: number | null;

  /** Scheduled wakeup time */
  scheduledWakeup: number | null;

  /** Statistics */
  statistics: {
    /** Total tasks completed */
    totalTasks: number;
    /** Total uptime in milliseconds */
    uptime: number;
  };
}

/**
 * Input for Soul execution (trigger context)
 */
export interface SoulInput {
  /** Trigger timestamp */
  trigger_time: string;

  /** Trigger context from application */
  context: {
    /** Trigger source (application-defined) */
    source: string;
    /** Context data (application-defined) */
    data: any;
  };
}

/**
 * Soul execution result
 */
export interface SoulResult {
  /** Whether the soul hibernated after execution */
  hibernated: boolean;

  /** Execution result from Agent */
  result: any;
}

/**
 * Tool definition for primitive operations
 */
export interface PrimitiveTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  implementation: (args: any) => Promise<any>;
}
