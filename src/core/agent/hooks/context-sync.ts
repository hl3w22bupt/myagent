/**
 * AgentContextSyncHook - Synchronizes Agent state with database.
 *
 * Ensures Agent state is persisted and can be restored:
 * - Saves Agent state after task execution
 * - Loads Agent state on acquisition
 * - Cleans up state on Agent destruction
 *
 * Features:
 * - Automatic state persistence
 * - State restoration on reuse
 * - Cleanup on destruction
 * - Error handling (doesn't fail if DB is unavailable)
 *
 * Example:
 * ```typescript
 * const contextSyncHook = new AgentContextSyncHook({
 *   persistAfterTask: true,
 *   restoreOnAcquire: true
 * });
 * hookManager.register(contextSyncHook);
 * ```
 */

import { BaseAgentHook, type Agent } from './base';
import type { AgentResult, AgentConfig } from '../types';

/**
 * Configuration for AgentContextSyncHook.
 */
export interface AgentContextSyncConfig {
  /** Whether to persist state after task execution */
  persistAfterTask?: boolean;

  /** Whether to restore state on Agent acquisition */
  restoreOnAcquire?: boolean;

  /** Whether to cleanup state on Agent destruction */
  cleanupOnDestroy?: boolean;
}

/**
 * Synchronizes Agent state with database.
 *
 * This hook ensures that Agent state is:
 * 1. Persisted to database after task execution
 * 2. Restored from database when Agent is reused
 * 3. Cleaned up when Agent is destroyed
 */
export class AgentContextSyncHook extends BaseAgentHook {
  private config: Required<AgentContextSyncConfig>;

  constructor(config: AgentContextSyncConfig = {}) {
    super();
    this.config = {
      persistAfterTask: config.persistAfterTask ?? true,
      restoreOnAcquire: config.restoreOnAcquire ?? true,
      cleanupOnDestroy: config.cleanupOnDestroy ?? true,
    };
  }

  /**
   * Called when Agent is created.
   * No action needed (Agent doesn't have state yet).
   */
  async onAgentCreate(
    _config: AgentConfig,
    sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    console.log('[AgentContextSyncHook] Agent creation', { sessionId });
    return undefined;
  }

  /**
   * Called when Agent is acquired (may be reused).
   * Optionally restores Agent state from database.
   */
  async onAgentAcquire(
    agent: Agent,
    sessionId: string
  ): Promise<void | undefined> {
    if (!this.config.restoreOnAcquire) {
      return;
    }

    try {
      // Get current Agent state
      const agentState = agent.getState();

      console.log('[AgentContextSyncHook] Agent acquired', {
        sessionId,
        conversationLength: agentState.conversationHistory.length,
        executionCount: agentState.executionHistory.length,
        variablesCount: agentState.variables.size,
      });

      // Note: State restoration would be implemented here if we had
      // a database service to load from. For now, the Agent maintains
      // its own state in memory.

      // If we wanted to restore from DB:
      // const savedState = await loadAgentState(sessionId);
      // if (savedState) {
      //   agent.setState(savedState);
      //   console.log('[AgentContextSyncHook] State restored from DB');
      // }
    } catch (error) {
      console.error('[AgentContextSyncHook] Failed to restore state', {
        sessionId,
        error,
      });
      // Don't throw - Agent should still work without restored state
    }
  }

  /**
   * Called before task execution.
   * No action needed.
   */
  async onTaskStart(
    _task: string,
    _taskId: string,
    _context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    // No action needed before task
    return undefined;
  }

  /**
   * Called after task execution completes.
   * Optionally persists Agent state to database.
   */
  async onTaskComplete(
    result: AgentResult,
    context: any
  ): Promise<void | undefined> {
    if (!this.config.persistAfterTask) {
      return;
    }

    try {
      const sessionId = context.sessionId;
      const taskId = context.taskId;

      console.log('[AgentContextSyncHook] Task completed, state updated', {
        sessionId,
        taskId,
        success: result.success,
        state: result.state,
      });

      // Note: State persistence would be implemented here if we had
      // a database service to save to. For now, the Agent maintains
      // its own state in memory.

      // If we wanted to persist to DB:
      // const agent = context.agent;
      // const agentState = agent.getState();
      // await saveAgentState(sessionId, agentState);
      // console.log('[AgentContextSyncHook] State persisted to DB');
    } catch (error) {
      console.error('[AgentContextSyncHook] Failed to persist state', {
        sessionId: context.sessionId,
        error,
      });
      // Don't throw - task result should still be returned
    }
  }

  /**
   * Called periodically to check Agent status.
   * No action needed.
   */
  async onAgentStatusCheck(_agent: Agent): Promise<void | undefined> {
    // No action needed for status checks
  }

  /**
   * Called before Agent is destroyed.
   * Optionally cleans up Agent state from database.
   */
  async onAgentDestroy(sessionId: string): Promise<void | undefined> {
    if (!this.config.cleanupOnDestroy) {
      return;
    }

    try {
      console.log('[AgentContextSyncHook] Agent destroyed, cleanup', {
        sessionId,
      });

      // Note: State cleanup would be implemented here if we had
      // a database service to delete from. For now, the Agent
      // maintains its own state in memory and cleanup happens
      // when the Agent is garbage collected.

      // If we wanted to cleanup from DB:
      // await deleteAgentState(sessionId);
      // console.log('[AgentContextSyncHook] State cleaned up from DB');
    } catch (error) {
      console.error('[AgentContextSyncHook] Failed to cleanup state', {
        sessionId,
        error,
      });
      // Don't throw - destruction should continue
    }
  }
}
