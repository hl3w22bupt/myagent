import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getDataStore } from '../../src/core/database/data-store';
import { v4 as uuidv4 } from 'uuid';

describe('DataStore', () => {
  let dataStore: ReturnType<typeof getDataStore>;

  beforeAll(async () => {
    dataStore = getDataStore(':memory:');
    await dataStore.initialize();
  });

  afterAll(async () => {
    await dataStore.close();
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
    // PostgreSQL initializes currentTurn to 1
    expect(context.currentTurn).toBe(1);
    // PostgreSQL auto-creates initial user message
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0].role).toBe('user');
    expect(context.messages[0].content).toBe('测试任务');
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
      currentTurn: 1,
      messages: [
        {
          id: 'msg-' + uuidv4(),
          taskId: taskId,
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
    expect(retrieved?.currentTurn).toBe(1);
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

    expect(updated.currentTurn).toBe(1);
    // PostgreSQL auto-creates initial user message, so we have 2 messages total
    expect(updated.messages).toHaveLength(2);
    // First message is the initial user message
    expect(updated.messages[0].role).toBe('user');
    expect(updated.messages[0].content).toBe('测试');
    // Second message is the assistant message we just added
    expect(updated.messages[1].role).toBe('assistant');
    expect(updated.messages[1].content).toBe('你好！有什么我可以帮助的吗？');
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
