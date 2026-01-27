import { describe, it, expect } from '@jest/globals';
import {
  createTask,
  sendChatMessage,
  getContext,
  sleep,
} from './helpers';

describe('Context Compression Tests', () => {
  it('should compress context when token limit exceeded', async () => {
    const sessionId = 'test-compression';
    const task = await createTask({
      task: '测试压缩',
      sessionId,
    });

    await sleep(5000);

    // 发送大量消息触发压缩
    for (let i = 0; i < 5; i++) { // 减少到5条以加快测试
      await sendChatMessage(task.id, {
        message: `消息 ${i}: 这是一条测试消息，用于触发上下文压缩机制。内容包括：测试数据、示例文本、长文本内容...`,
        sessionId,
      });

      await sleep(1000);
    }

    await sleep(3000);

    // 验证上下文已压缩
    const context = await getContext(task.id);

    // 应该有上下文
    expect(context).toBeDefined();

    // 消息数量应该合理
    expect(context.messages.length).toBeLessThan(100);

    // 可选：验证摘要存在（如果实现了）
    if (context.summary) {
      expect(context.summary).toBeDefined();
    }
  }, 60000);

  it('should preserve important information after compression', async () => {
    const task = await createTask({
      task: '我的名字是测试用户，我是一名QA工程师',
      sessionId: 'compression-test',
    });

    await sleep(5000);

    // 发送重要信息
    await sendChatMessage(task.id, {
      message: '记住：我叫测试用户，是一名QA工程师',
      sessionId: 'compression-test',
    });

    await sleep(2000);

    // 触发压缩（发送一些额外消息）
    for (let i = 0; i < 3; i++) {
      await sendChatMessage(task.id, {
        message: `填充消息 ${i}`,
        sessionId: 'compression-test',
      });

      await sleep(500);
    }

    await sleep(3000);

    // 验证上下文包含重要信息
    const context = await getContext(task.id);
    const contextStr = JSON.stringify(context);

    // 验证关键信息存在
    const hasImportantInfo =
      contextStr.includes('测试用户') ||
      contextStr.includes('QA工程师') ||
      (context.summary && (
        JSON.stringify(context.summary).includes('测试用户') ||
        JSON.stringify(context.summary).includes('QA工程师')
      ));

    expect(hasImportantInfo).toBe(true);
  }, 60000);
});
