/**
 * Agent Hooks System Tests
 *
 * Tests for the Agent Hook system including:
 * - BaseAgentHook interface
 * - AgentHookManager
 * - AgentMonitoringHook
 * - AgentContextSyncHook
 * - AgentProgressNotifyHook
 */

// @ts-nocheck - Disable strict type checking for test mocks

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AgentHookManager } from '@/core/agent/hooks/manager';
import {
  AgentMonitoringHook,
  AgentContextSyncHook,
  AgentProgressNotifyHook,
  setAgentStreams,
} from '@/core/agent/hooks';
import type { AgentResult } from '@/core/agent/types';

// Mock Agent class
class MockAgent {
  private id: string;
  private sessionId: string;

  constructor(sessionId: string) {
    this.id = `agent-${sessionId}`;
    this.sessionId = sessionId;
  }

  getId(): string {
    return this.id;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async run(task: string): Promise<AgentResult> {
    return {
      success: true,
      output: `Executed: ${task}`,
      steps: [],
      executionTime: 100,
      metadata: {
        llmCalls: 1,
        skillCalls: 0,
        totalTokens: 100,
      },
    };
  }

  getState(): any {
    return {
      conversationHistory: [],
      executionHistory: [],
      variables: new Map(),
      lastActivityAt: Date.now(),
    };
  }

  async cleanup(): Promise<void> {}
}

describe('AgentHookManager', () => {
  let manager: any;

  beforeEach(() => {
    manager = new AgentHookManager();
  });

  it('should register and manage hooks', () => {
    const mockHook: any = {};
    ['onAgentCreate', 'onAgentAcquire', 'onTaskStart', 'onTaskComplete', 'onAgentStatusCheck', 'onAgentDestroy']
      .forEach(method => { mockHook[method] = jest.fn().mockResolvedValue(undefined); });

    manager.register(mockHook);
    expect(manager.getHookCount()).toBe(1);

    manager.unregister(mockHook);
    expect(manager.getHookCount()).toBe(0);
  });

  it('should execute hooks and aggregate results', async () => {
    const mockHook: any = {};
    ['onAgentAcquire', 'onTaskStart', 'onTaskComplete', 'onAgentStatusCheck', 'onAgentDestroy']
      .forEach(method => { mockHook[method] = jest.fn().mockResolvedValue(undefined); });
    mockHook.onAgentCreate = jest.fn().mockResolvedValue({ abort: true, reason: 'Test' });

    manager.register(mockHook);

    const result = await manager.executeHook('onAgentCreate', {}, 'session-1');
    expect(result).toEqual({ abort: true, reason: 'Test' });
  });

  it('should clear all hooks', () => {
    const mockHook: any = {};
    ['onAgentCreate', 'onAgentAcquire', 'onTaskStart', 'onTaskComplete', 'onAgentStatusCheck', 'onAgentDestroy']
      .forEach(method => { mockHook[method] = jest.fn(); });

    manager.register(mockHook);
    expect(manager.getHookCount()).toBe(1);

    manager.clear();
    expect(manager.getHookCount()).toBe(0);
  });
});

describe('AgentMonitoringHook', () => {
  let hook: AgentMonitoringHook;
  let mockAgent: MockAgent;

  beforeEach(() => {
    hook = new AgentMonitoringHook({ logMetrics: false });
    mockAgent = new MockAgent('test-session');
  });

  it('should track agent acquisition', async () => {
    await hook.onAgentAcquire(mockAgent as any, 'session-1');

    const healthStatus = hook.getHealthStatus('session-1');
    expect(healthStatus).toBeDefined();
    expect(healthStatus?.status).toBe('healthy');
  });

  it('should track task completion', async () => {
    await hook.onAgentAcquire(mockAgent as any, 'session-1');

    const mockResult: AgentResult = {
      success: true,
      output: 'Test output',
      steps: [],
      executionTime: 500,
      metadata: {
        llmCalls: 2,
        skillCalls: 1,
        totalTokens: 500,
      },
    };

    await hook.onTaskComplete(mockResult, { sessionId: 'session-1', taskId: 'task-1' });

    const monitoringData = hook.getMonitoringData('session-1');
    expect(monitoringData?.taskCount).toBe(1);
    expect(monitoringData?.totalExecutionTime).toBe(500);
  });

  it('should cleanup on agent destroy', async () => {
    await hook.onAgentAcquire(mockAgent as any, 'session-1');
    expect(hook.getHealthStatus('session-1')).toBeDefined();

    await hook.onAgentDestroy('session-1');
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

    expect(hook.getHealthStatus('session-1')).toBeUndefined();
    expect(hook.getMonitoringData('session-1')).toBeUndefined();
  });
});

describe('AgentContextSyncHook', () => {
  let hook: AgentContextSyncHook;
  let mockAgent: MockAgent;

  beforeEach(() => {
    hook = new AgentContextSyncHook();
    mockAgent = new MockAgent('test-session');
  });

  it('should handle agent acquisition', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await hook.onAgentAcquire(mockAgent as any, 'session-1');

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('should handle task completion', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const mockResult: AgentResult = {
      success: true,
      output: 'Test output',
      steps: [],
      executionTime: 500,
      metadata: {
        llmCalls: 1,
        skillCalls: 0,
        totalTokens: 100,
      },
    };

    await hook.onTaskComplete(mockResult, {
      sessionId: 'session-1',
      taskId: 'task-1',
    });

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });
});

describe('AgentProgressNotifyHook', () => {
  let hook: AgentProgressNotifyHook;
  let mockAgent: MockAgent;
  let mockStreams: any;

  beforeEach(() => {
    hook = new AgentProgressNotifyHook();
    mockAgent = new MockAgent('test-session');

    // Mock streams
    mockStreams = {
      agentProgress: {
        set: jest.fn().mockResolvedValue(Promise.resolve()),
      },
    };

    setAgentStreams(mockStreams);
  });

  it('should send notification on agent acquire', async () => {
    await hook.onAgentAcquire(mockAgent as any, 'session-1');

    expect(mockStreams.agentProgress.set).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        type: 'agent_acquired',
        sessionId: 'session-1',
        agentId: expect.any(String),
      })
    );
  });

  it('should send notification on task start', async () => {
    await hook.onTaskStart('Test task', 'task-1', {
      sessionId: 'session-1',
    });

    expect(mockStreams.agentProgress.set).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        type: 'task_start',
        sessionId: 'session-1',
        taskId: 'task-1',
      })
    );
  });

  it('should send notification on task complete', async () => {
    const mockResult: AgentResult = {
      success: true,
      output: 'Test output',
      steps: [],
      executionTime: 500,
      metadata: {
        llmCalls: 1,
        skillCalls: 0,
        totalTokens: 100,
      },
    };

    await hook.onTaskComplete(mockResult, {
      sessionId: 'session-1',
      taskId: 'task-1',
    });

    expect(mockStreams.agentProgress.set).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        type: 'task_complete',
        sessionId: 'session-1',
        taskId: 'task-1',
      })
    );
  });

  it('should handle missing streams gracefully', async () => {
    // Reset streams
    setAgentStreams(undefined as any);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await hook.onAgentAcquire(mockAgent as any, 'session-2');

    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
