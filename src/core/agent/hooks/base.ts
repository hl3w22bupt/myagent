/**
 * BaseAgentHook - Abstract base class for Agent lifecycle hooks.
 *
 * Agent Hooks provide intervention points in the Agent lifecycle:
 * - Agent creation/acquisition
 * - Task execution (before/after)
 * - Periodic status checks
 * - Agent destruction
 *
 * These hooks operate at the Agent instance level (per session),
 * distinct from Task Hooks (per task) and Skill Hooks (per skill).
 *
 * Execution Order:
 * 1. Task Hooks (Session-level: context management, session monitoring)
 * 2. Agent Hooks (Agent-level: instance management, state coordination) ← You are here
 * 3. Skill Hooks (Skill-level: single skill execution, lightweight)
 */

import type { AgentConfig, AgentResult } from '../types';

// Forward declaration for Agent interface
export interface Agent {
  getId(): string;
  getSessionId(): string;
  run(task: string, taskId?: string, context?: any): Promise<AgentResult>;
  getState(): any;
  cleanup(): Promise<void>;
}

/**
 * Agent context information passed to hooks.
 */
export interface AgentContext {
  /** Unique Agent instance ID */
  agentId: string;

  /** Session identifier (maps Agent to session) */
  sessionId: string;

  /** Agent type (regular agent or master agent with delegation) */
  agentType: 'agent' | 'master';

  /** Current Agent state */
  state: any;

  /** Agent configuration */
  config: AgentConfig;

  /** Number of tasks executed by this Agent */
  taskCount: number;

  /** Agent creation timestamp */
  createdAt: number;
}


/**
 * Abstract base class for Agent Hooks.
 *
 * All Agent hooks must extend this class and implement its methods.
 * Hooks are called synchronously in registration order during Agent lifecycle events.
 *
 * Example:
 * ```typescript
 * class MyAgentHook extends BaseAgentHook {
 *   onAgentCreate(config, sessionId) {
 *     console.log(`Creating agent for session ${sessionId}`);
 *     // Return { abort: true, reason: 'xxx' } to abort creation
 *   }
 *
 *   onTaskStart(task, taskId, context) {
 *     console.log(`Starting task: ${task}`);
 *     // Return { modifiedTask: 'xxx' } to modify task
 *   }
 *
 *   // ... implement other methods
 * }
 * ```
 */
export abstract class BaseAgentHook {
  /**
   * Called before Agent is created.
   *
   * Use this to:
   * - Validate Agent configuration
   * - Log Agent creation events
   * - Prevent Agent creation if needed
   *
   * @param config - Agent configuration
   * @param sessionId - Session identifier
   * @returns Optional abort signal to prevent Agent creation
   */
  abstract onAgentCreate(
    config: AgentConfig,
    sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined>;

  /**
   * Called when Agent is acquired (may be existing Agent).
   *
   * Use this to:
   * - Track Agent usage
   * - Update Agent metrics
   * - Initialize Agent-specific resources
   *
   * @param agent - Agent instance (may be reused from previous acquisition)
   * @param sessionId - Session identifier
   */
  abstract onAgentAcquire(
    agent: Agent,
    sessionId: string
  ): Promise<void | undefined>;

  /**
   * Called before task execution (before Task Hooks).
   *
   * Use this to:
   * - Modify task description
   * - Add Agent-level context
   * - Track task starts
   *
   * @param task - Task description
   * @param taskId - Task identifier
   * @param context - Task execution context
   * @returns Optional modified task
   */
  abstract onTaskStart(
    task: string,
    taskId: string,
    context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined>;

  /**
   * Called after task execution completes (after Task Hooks).
   *
   * Use this to:
   * - Process task results
   * - Update Agent statistics
   * - Track task completion metrics
   *
   * @param result - Agent execution result
   * @param context - Task execution context
   */
  abstract onTaskComplete(
    result: AgentResult,
    context: any
  ): Promise<void | undefined>;

  /**
   * Called periodically to check Agent status.
   *
   * Use this to:
   * - Monitor Agent health
   * - Detect stale Agents
   * - Collect Agent metrics
   *
   * @param agent - Agent instance to check
   */
  abstract onAgentStatusCheck(
    agent: Agent
  ): Promise<void | undefined>;

  /**
   * Called before Agent is destroyed.
   *
   * Use this to:
   * - Cleanup Agent resources
   * - Save Agent state
   * - Log Agent destruction
   *
   * @param sessionId - Session identifier
   */
  abstract onAgentDestroy(
    sessionId: string
  ): Promise<void | undefined>;
}
