/**
 * Agent Trace Hook.
 *
 * Captures detailed execution traces at the Agent level.
 * Records input/output, errors, timing, and metadata for agent execution.
 * Maintains hierarchical relationship with parent task traces.
 */

import { BaseAgentHook, type Agent } from './base';
import type { AgentConfig, AgentResult } from '../types';
import { getAgentStreams } from './progress-notify';

/**
 * Agent-level execution tracing hook.
 * Provides detailed tracking of agent execution lifecycle.
 * Links to parent task traces for hierarchical tracing.
 */
export class AgentTraceHook extends BaseAgentHook {
  private currentTraces: Map<string, { preTraceId: string; taskId: string }> = new Map();

  /**
   * Get consistent session ID from context
   */
  private getSessionId(context: Partial<any>): string {
    return context.sessionId || context.agentId || 'unknown';
  }

  /**
   * Called when Agent is created.
   * Records agent creation trace.
   */
  async onAgentCreate(
    _config: AgentConfig,
    _sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    // Agent creation trace will be recorded in onTaskStart
    return undefined;
  }

  /**
   * Called when Agent is acquired.
   * Records agent acquisition/start trace with parent task relationship.
   */
  async onAgentAcquire(_agent: Agent, _sessionId: string): Promise<void> {
    // This hook doesn't have taskId yet, we'll trace in onTaskStart instead
    return undefined;
  }

  /**
   * Called before task execution.
   * Records the initial agent trace with input data and parent task reference.
   */
  async onTaskStart(
    task: string,
    taskId: string,
    context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    const streams = getAgentStreams();

    if (!streams || !streams.executionTraces) {
      // No streams available, skip tracing
      console.log('[AgentTraceHook] No streams available, skipping trace');
      return undefined;
    }

    const sessionId = this.getSessionId(context);
    const agentId = context.agentId || sessionId;
    const id = `agent-${sessionId}-pre-${Date.now()}`;

    try {
      // Get subject info from agent instance
      const agent = context.agent as any;
      const subjectInfo = agent?.getSubjectInfo?.() || {
        subjectTitle: context.agentType === 'MasterAgent' ? 'Master Agent' : 'Subagent',
        subjectSubTitle: context.subagentName || undefined,
      };

      // Create initial agent trace entry
      await streams.executionTraces.set(taskId, id, {
        traceId: id,
        level: 'agent',
        taskId,
        agentId,
        stage: 'pre',
        status: 'started',
        retryCount: 0,
        maxRetries: 3,
        inputData: JSON.stringify({
          task,
          agentType: context.agentType,
        }),
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId,
          subjectTitle: subjectInfo.subjectTitle,
          subjectSubTitle: subjectInfo.subjectSubTitle,
          llmProvider: context.llmProvider,
          llmModel: context.llmModel,
        }
      });

      // Store trace info for post-execution (use sessionId as key)
      this.currentTraces.set(sessionId, { preTraceId: id, taskId });

      console.log('[AgentTraceHook] ✓ Pre-task trace recorded', { taskId, sessionId, agentId, id });
    } catch (error) {
      console.error('[AgentTraceHook] ✗ Failed to record pre-task trace', { error, taskId, sessionId });
    }

    return undefined;
  }

  /**
   * Called after task execution completes.
   * Records the final agent trace with output and status.
   */
  async onTaskComplete(result: AgentResult, context: any): Promise<void> {
    const streams = getAgentStreams();

    if (!streams || !streams.executionTraces) {
      return undefined;
    }

    const sessionId = this.getSessionId(context);
    const agentId = context.agentId || sessionId;
    const stored = this.currentTraces.get(sessionId);

    if (!stored) {
      console.warn('[AgentTraceHook] No pre-task trace found for agent', { sessionId, agentId });
      return undefined;
    }

    const { taskId } = stored;
    const id = `agent-${sessionId}-post-${Date.now()}`;

    try {
      // Get subject info from agent instance
      const agent = context.agent as any;
      const subjectInfo = agent?.getSubjectInfo?.() || {
        subjectTitle: context.agentType === 'MasterAgent' ? 'Master Agent' : 'Subagent',
        subjectSubTitle: context.subagentName || undefined,
      };

      // Determine final status
      const status = result.success ? 'completed' : 'failed';

      // Create a separate post trace entry (don't overwrite pre!)
      await streams.executionTraces.set(taskId, id, {
        traceId: id,
        level: 'agent',
        taskId,
        agentId,
        stage: 'post',
        status,
        outputData: result.output ? JSON.stringify(result.output) : undefined,
        error: result.error,
        executionTime: result.executionTime,
        retryCount: 0,
        maxRetries: 3,
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId,
          subjectTitle: subjectInfo.subjectTitle,
          subjectSubTitle: subjectInfo.subjectSubTitle,
          success: result.success,
        }
      });

      // Clear stored trace info
      this.currentTraces.delete(sessionId);

      console.log('[AgentTraceHook] ✓ Post-task trace recorded', { taskId, sessionId, agentId, id, status });
    } catch (error) {
      console.error('[AgentTraceHook] ✗ Failed to record post-task trace', { error, taskId, sessionId });
    }
  }

  /**
   * Called periodically to check Agent status.
   */
  async onAgentStatusCheck(_agent: Agent): Promise<void> {
    return undefined;
  }

  /**
   * Called before Agent is destroyed.
   */
  async onAgentDestroy(_sessionId: string): Promise<void> {
    // Clean up any remaining trace IDs
    for (const [agentId] of this.currentTraces.entries()) {
      this.currentTraces.delete(agentId);
    }
    return undefined;
  }

  async onAwaitingHITL(
    _question: string,
    _options?: string[],
    _agentContext?: any
  ): Promise<void | undefined> {
    // Not used in this hook
    return undefined;
  }
}
