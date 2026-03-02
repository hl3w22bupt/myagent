/**
 * Default Context Orchestrator Tests
 *
 * 测试默认编排器的上下文组装功能
 */

import { describe, it, expect } from '@jest/globals';
import { DefaultContextOrchestrator } from '../../../../src/core/context/default-orchestrator';
import type { OrchestratedContext } from '../../../../src/core/context/orchestrator';
import type { SessionState } from '../../../../src/core/agent/types';

describe('DefaultContextOrchestrator', () => {
  let orchestrator: DefaultContextOrchestrator;

  beforeEach(() => {
    orchestrator = new DefaultContextOrchestrator();
  });

  describe('getContext', () => {
    it('should extract history from state.conversationHistory', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'assistant', content: 'Hi there', timestamp: 1001 },
        ],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.history).toHaveLength(2);
      expect(result.history[0].content).toBe('Hello');
      expect(result.history[1].content).toBe('Hi there');
    });

    it('should return empty history when state.conversationHistory is empty', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.history).toEqual([]);
    });

    it('should extract variables from state.variables (Map)', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map([['foo', 'bar'], ['baz', 'qux']]),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.variables).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should extract variables from state.variables (Object)', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: { foo: 'bar', baz: 'qux' } as any,
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.variables).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should return empty variables when state.variables is empty', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.variables).toEqual({});
    });

    it('should extract originalTask from context', async () => {
      const context = {
        originalTask: 'Generate a video',
      };

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.originalTask).toBe('Generate a video');
    });

    it('should not have originalTask when not in context', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.originalTask).toBeUndefined();
    });

    it('should extract userProfile from context.context.workingMemory.userProfile', async () => {
      const context = {
        context: {
          workingMemory: {
            userProfile: {
              userId: 'user-123',
              preferences: ['喜欢简洁回复', '偏好中文'],
              habits: ['夜间活跃'],
              tags: ['新用户'],
              metadata: {
                lastUpdated: new Date(),
                version: 1,
              },
            },
          },
        },
      };

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.userProfile).toBeDefined();
      expect(result.userProfile?.userId).toBe('user-123');
      expect(result.userProfile?.preferences).toEqual(['喜欢简洁回复', '偏好中文']);
      expect(result.userProfile?.habits).toEqual(['夜间活跃']);
      expect(result.userProfile?.tags).toEqual(['新用户']);
    });

    it('should extract userProfile from context.workingMemory.userProfile', async () => {
      const context = {
        workingMemory: {
          userProfile: {
            userId: 'user-456',
            preferences: ['喜欢使用 emoji'],
            metadata: {
              lastUpdated: new Date(),
              version: 1,
            },
          },
        },
      };

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.userProfile).toBeDefined();
      expect(result.userProfile?.userId).toBe('user-456');
      expect(result.userProfile?.preferences).toEqual(['喜欢使用 emoji']);
    });

    it('should not include userProfile when enableUserProfile is false', async () => {
      const orchestrator = new DefaultContextOrchestrator({ enableUserProfile: false });
      const context = {
        context: {
          workingMemory: {
            userProfile: {
              userId: 'user-123',
              preferences: ['喜欢简洁回复'],
            },
          },
        },
      };

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.userProfile).toBeUndefined();
    });

    it('should not have userProfile when not in context', async () => {
      const context = {};

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.userProfile).toBeUndefined();
    });
  });

  describe('priority order', () => {
    it('should prioritize context.context.workingMemory.userProfile over context.workingMemory.userProfile', async () => {
      const context = {
        context: {
          workingMemory: {
            userProfile: {
              userId: 'from-nested',
              preferences: ['Nested profile'],
            },
          },
        },
        workingMemory: {
          userProfile: {
            userId: 'from-direct',
            preferences: ['Direct profile'],
          },
        },
      };

      const state: SessionState = {
        sessionId: 'test-session',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        conversationHistory: [],
        executionHistory: [],
        variables: new Map(),
      };

      const result: OrchestratedContext = await orchestrator.getContext(context, state);

      expect(result.userProfile?.userId).toBe('from-nested');
      expect(result.userProfile?.preferences).toEqual(['Nested profile']);
    });
  });
});
