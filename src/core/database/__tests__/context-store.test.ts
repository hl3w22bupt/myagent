import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ContextStore } from '../context-store';
import { getTaskStore } from '../task-store';

describe('ContextStore', () => {
  let contextStore: ContextStore;
  let taskStore = getTaskStore();

  beforeAll(async () => {
    contextStore = new ContextStore(':memory:');
    await contextStore.initialize();
  });

  afterAll(async () => {
    await contextStore.close();
  });

  it('should create a task context with all required fields', async () => {
    const task = await taskStore.create({
      id: 'test-task-1',
      task: '测试任务',
      sessionId: 'test-session-1',
      status: 'pending' as any,
    });

    const context = await contextStore.createTaskContext(task.id, task.sessionId, '测试任务');

    expect(context).toBeDefined();
    expect(context.taskId).toBe('test-task-1');
    expect(context.sessionId).toBe('test-session-1');
    expect(context.currentTurn).toBe(0);
    expect(context.messages).toEqual([]);
    expect(context.summary).toBeDefined();
    expect(context.artifactIndex).toEqual([]);
  });

  it('should save task context to database', async () => {
    const context = {
      taskId: 'test-task-2',
      sessionId: 'test-session-2',
      currentTurn: 1,
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: '你好',
          metadata: { timestamp: new Date(), tokens: 10 },
          compressed: false,
        }
      ],
      summary: {
        sessionIntent: '测试会话',
        currentTask: '测试任务',
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      },
      artifactIndex: [],
      workingMemory: {},
      metadata: {
        totalTokens: 1000,
        llmCallsCount: 1,
        skillCallsCount: 0,
      },
    };

    await contextStore.saveContext(context);

    const retrieved = await contextStore.getContext('test-task-2');
    expect(retrieved).toEqual(context);
  });

  it('should add message to existing context', async () => {
    const context = await contextStore.createTaskContext('test-task-3', 'test-session-3', '测试');

    const message = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: '你好！有什么我可以帮助的吗？',
      metadata: { timestamp: new Date(), tokens: 20 },
      compressed: false,
    };

    const updated = await contextStore.addMessage('test-task-3', message);

    expect(updated.currentTurn).toBe(1);
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe('你好！有什么我可以帮助的吗？');
  });

  it('should track artifact changes', async () => {
    const artifact = {
      taskId: 'test-task-4',
      artifactType: 'file' as const,
      action: 'modified' as const,
      path: '/src/app.ts',
      description: '添加了新的路由',
      timestamp: new Date(),
    };

    await contextStore.addArtifact(artifact);

    const artifacts = await contextStore.getArtifacts('test-task-4');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('/src/app.ts');
  });
});
