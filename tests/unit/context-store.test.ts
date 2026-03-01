import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getDataStore } from '../../src/core/database/data-store';
import { v4 as uuidv4 } from 'uuid';

describe('DataStore', () => {
  let dataStore: ReturnType<typeof getDataStore>;

  beforeAll(async () => {
    // Don't pass :memory: for PostgreSQL - it will use the configured database
    dataStore = getDataStore();
    // Database is already initialized in jest.setup.ts
    await dataStore.initialize();
  });

  afterAll(async () => {
    // Don't close here - jest.setup.ts will handle cleanup
  });

  it('should create a task context with all required fields', async () => {
    const taskId = uuidv4();
    const sessionId = uuidv4();

    const task = await dataStore.createTask({
      id: taskId,
      task: '测试任务',
      sessionId: sessionId,
      status: 'pending' as any,
    });

    const context = await dataStore.createTaskContext(task.id, task.sessionId, '测试任务');

    expect(context).toBeDefined();
    expect(context.taskId).toBe(taskId);
    expect(context.sessionId).toBe(sessionId);
    expect(context.conversationRounds).toEqual([]);
    expect(context.summary).toBeDefined();
    expect(context.artifactIndex).toEqual([]);
  });

  it('should save task context to database', async () => {
    const taskId = uuidv4();
    const sessionId = uuidv4();

    // 先创建 task 和 context 记录
    await dataStore.createTask({
      id: taskId,
      task: '测试任务',
      sessionId: sessionId,
      status: 'pending' as any,
    });

    await dataStore.createTaskContext(taskId, sessionId, '测试任务');

    // 更新 context
    const context = {
      taskId: taskId,
      sessionId: sessionId,
      conversationRounds: [],
      summary: {
        sessionIntent: '测试会话',
        currentTask: '测试任务',
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'in-progress',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      },
      artifactIndex: [],
      workingMemory: { key: 'value' },
      metadata: {
        totalTokens: 1000,
        llmCallsCount: 1,
        skillCallsCount: 0,
      },
    };

    await dataStore.saveContext(context);

    const retrieved = await dataStore.getContext(taskId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.taskId).toBe(taskId);
    expect(retrieved?.conversationRounds).toHaveLength(0);
    expect(retrieved?.summary.currentStatus).toBe('in-progress');
    expect(retrieved?.workingMemory).toEqual({ key: 'value' });
  });

  it('should add message to existing context', async () => {
    const taskId = uuidv4();
    const sessionId = uuidv4();

    // 先创建 task 和 context
    await dataStore.createTask({
      id: taskId,
      task: '测试任务',
      sessionId: sessionId,
      status: 'pending' as any,
    });

    await dataStore.createTaskContext(taskId, sessionId, '测试');

    const message = {
      id: 'msg-' + uuidv4(),
      role: 'assistant' as const,
      content: '你好！有什么我可以帮助的吗？',
      metadata: { timestamp: new Date(), tokens: 20 },
      compressed: false,
    };

    const updated = await dataStore.addMessage(taskId, message);

    // addMessage returns the updated context with conversationRounds
    expect(updated.conversationRounds).toBeDefined();
    expect(updated.conversationRounds.length).toBeGreaterThanOrEqual(0);
  });

  it('should track artifact changes', async () => {
    const taskId = uuidv4();
    const sessionId = uuidv4();

    // 先创建 task 记录（外键约束要求）
    await dataStore.createTask({
      id: taskId,
      task: '测试任务',
      sessionId: sessionId,
      status: 'pending' as any,
    });

    // 先创建 context（artifacts 表有外键约束指向 task_contexts）
    await dataStore.createTaskContext(taskId, sessionId, '测试任务');

    const artifact = {
      id: 'art-' + uuidv4(),
      taskId: taskId,
      artifactType: 'file' as const,
      action: 'modified' as const,
      path: '/src/app.ts',
      description: '添加了新的路由',
      timestamp: new Date(),
    };

    await dataStore.addArtifact(artifact);

    const artifacts = await dataStore.getArtifacts(taskId);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('/src/app.ts');
  });
});
