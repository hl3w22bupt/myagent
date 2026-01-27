import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createTask,
  sendChatMessage,
  getContext,
  sleep,
} from '../helpers';

describe('Multi-turn Chat E2E Tests', () => {
  describe('Basic Multi-turn Conversation', () => {
    it('should handle multiple chat messages in a session', async () => {
      // 1. 创建任务
      const task = await createTask({
        task: '我的名字是Leo，是一名软件工程师',
        sessionId: 'test-session-1',
      });

      // 2. 等待任务完成
      await sleep(5000);

      // 3. 发送第一条聊天消息
      await sendChatMessage(task.id, {
        message: '我叫什么名字?',
        sessionId: 'test-session-1',
      });

      await sleep(3000);

      // 4. 发送第二条聊天消息
      await sendChatMessage(task.id, {
        message: '我的职业是什么?',
        sessionId: 'test-session-1',
      });

      await sleep(3000);

      // 5. 验证上下文已保存
      const context = await getContext(task.id);
      expect(context).toBeDefined();
      expect(context.messages.length).toBeGreaterThan(4); // 初始任务 + 2轮对话

      // 验证消息内容
      const userMessages = context.messages.filter((m: any) => m.role === 'user');
      expect(userMessages.length).toBe(3); // 初始任务 + 2条聊天
    }, 30000);

    it('should maintain context across different sessions', async () => {
      // 验证不同sessionId的隔离性
      const task1 = await createTask({
        task: '任务1',
        sessionId: 'session-a',
      });

      const task2 = await createTask({
        task: '任务2',
        sessionId: 'session-b',
      });

      await sleep(5000);

      await sendChatMessage(task1.id, {
        message: '这是session-a的消息',
        sessionId: 'session-a',
      });

      await sendChatMessage(task2.id, {
        message: '这是session-b的消息',
        sessionId: 'session-b',
      });

      await sleep(3000);

      // 验证两个session的上下文是隔离的
      const context1 = await getContext(task1.id);
      const context2 = await getContext(task2.id);

      expect(context1.sessionId).toBe('session-a');
      expect(context2.sessionId).toBe('session-b');
      expect(context1.messages).not.toEqual(context2.messages);
    }, 30000);
  });

  describe('Context Retention', () => {
    it('should remember information from previous turns', async () => {
      const task = await createTask({
        task: '我喜欢编程，特别是JavaScript和Python',
        sessionId: 'context-test-1',
      });

      await sleep(5000);

      await sendChatMessage(task.id, {
        message: '我喜欢什么编程语言?',
        sessionId: 'context-test-1',
      });

      await sleep(3000);

      const context = await getContext(task.id);

      // 验证上下文包含原始任务信息
      const contextStr = JSON.stringify(context);
      const hasJavaScript = contextStr.includes('JavaScript');
      const hasPython = contextStr.includes('Python');

      expect(hasJavaScript || hasPython).toBe(true);
    }, 30000);
  });
});
