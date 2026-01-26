import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextManager } from '../manager';
import { ContextStore } from '../../database/context-store';
import type { TaskContext, Message } from '../../database/context-types';

describe('ContextManager', () => {
  let manager: ContextManager;
  let store: ContextStore;

  beforeEach(async () => {
    store = new ContextStore(':memory:');
    await store.initialize();
    manager = new ContextManager(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should create task context with initial state', async () => {
    const context = await manager.createTaskContext('task-1', 'session-1', '测试任务');

    expect(context.taskId).toBe('task-1');
    expect(context.currentTurn).toBe(0);
    expect(context.messages).toEqual([]);
    expect(context.summary.currentTask).toBe('测试任务');
  });

  it('should add message and update turn count', async () => {
    await manager.createTaskContext('task-2', 'session-2', '测试');

    const message: Message = {
      id: 'msg-1',
      taskId: 'task-2',
      role: 'user',
      content: '你好',
      metadata: { timestamp: new Date(), tokens: 10 },
    };

    const updated = await manager.addMessage('task-2', message);

    expect(updated.currentTurn).toBe(1);
    expect(updated.messages).toHaveLength(1);
    expect(updated.metadata.totalTokens).toBe(10);
  });

  it('should compress context when token threshold exceeded', async () => {
    await manager.createTaskContext('task-3', 'session-3', '测试');

    // 添加大量消息模拟token超限
    for (let i = 0; i < 25; i++) {
      const message: Message = {
        id: `msg-${i}`,
        taskId: 'task-3',
        role: 'assistant',
        content: `这是第${i}条消息`,
        metadata: { timestamp: new Date(), tokens: 5000 },
      };
      await manager.addMessage('task-3', message);
    }

    const context = await manager.getContext('task-3');

    // 应该触发压缩
    expect(context.messages.length).toBeLessThan(25);
    expect(context.metadata.lastCompressedAt).toBeDefined();
  });

  it('should extract and track artifacts from messages', async () => {
    await manager.createTaskContext('task-4', 'session-4', '测试');

    const message: Message = {
      id: 'msg-1',
      taskId: 'task-4',
      role: 'assistant',
      content: '已创建文件 /src/app.ts 并添加了新路由',
      metadata: {
        timestamp: new Date(),
        tokens: 20,
        skillCalls: ['file-write'],
      },
    };

    await manager.addMessage('task-4', message);

    const artifacts = await store.getArtifacts('task-4');

    // 应该提取到文件artifact
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some(a => a.artifactType === 'file')).toBe(true);
  });
});
