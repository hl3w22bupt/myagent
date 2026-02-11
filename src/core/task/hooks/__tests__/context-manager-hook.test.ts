import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextManagerTaskHook } from '../context-manager';
import { getDataStore } from '@/core/database/data-store';
import type { TaskContext } from '../types';
import { ContextManager } from '@/core/context/manager';

describe('ContextManagerTaskHook Integration', () => {
  let hook: ContextManagerTaskHook;
  let store: ReturnType<typeof getDataStore>;
  let contextManager: ContextManager;

  beforeEach(async () => {
    store = getDataStore(':memory:');
    await store.initialize();
    contextManager = new ContextManager(store);
    hook = new ContextManagerTaskHook(contextManager);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should create context in preExec', async () => {
    const taskContext: TaskContext = {
      taskId: 'test-task-1',
      sessionId: 'test-session-1',
      task: '测试任务',
      status: 'pending',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      services: {
        streams: null,
        logger: console,
        emit: null,
      },
    };

    await hook.preExec(taskContext);

    expect(taskContext.context).toBeDefined();
    if (taskContext.context) {
      expect(taskContext.context.messages).toEqual([]);
      expect(taskContext.context.summary.currentTask).toBe('测试任务');
    }
  });

  it('should save context in postExec', async () => {
    const taskContext: TaskContext = {
      taskId: 'test-task-2',
      sessionId: 'test-session-2',
      task: '测试任务',
      status: 'completed',
      context: {
        taskId: 'test-task-2',
        sessionId: 'test-session-2',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: '',
          currentTask: '测试任务',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
        },
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      services: {
        streams: null,
        logger: console,
        emit: null,
      },
    };

    const result = {
      success: true,
      output: '任务完成',
      executionTime: 1000,
    };

    await hook.postExec(taskContext, result);

    // 验证上下文已保存
    const saved = await contextManager.getContext('test-task-2');
    expect(saved).toBeDefined();
  });
});
