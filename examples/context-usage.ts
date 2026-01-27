/**
 * 上下文管理系统使用示例
 */

import { ContextManager } from '../src/core/context/manager';
import { getDataStore } from '../src/core/database/data-store';
import type { Message } from '../src/core/database/context-types';

async function basicUsageExample() {
  console.log('=== 基本使用示例 ===');

  const store = getDataStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);

  // 1. 创建任务上下文
  const context = await manager.createTaskContext(
    'task-1',
    'session-1',
    '创建React用户列表组件'
  );

  console.log('任务上下文已创建:', {
    taskId: context.taskId,
    currentTurn: context.currentTurn,
  });

  // 2. 添加用户消息
  const userMessage: Message = {
    id: 'msg-1',
    taskId: 'task-1',
    role: 'user',
    content: '创建一个显示用户列表的React组件',
    metadata: { timestamp: new Date(), tokens: 20 },
  };

  await manager.addMessage('task-1', userMessage);
  console.log('用户消息已添加');

  // 3. 添加助手响应
  const assistantMessage: Message = {
    id: 'msg-2',
    taskId: 'task-1',
    role: 'assistant',
    content: '我将创建UserList组件，包含用户数据获取和展示逻辑',
    metadata: { timestamp: new Date(), tokens: 30, skillCalls: ['file-write'] },
  };

  const updated = await manager.addMessage('task-1', assistantMessage);
  console.log('助手响应已添加，当前轮次:', updated.currentTurn);

  // 4. 查询Artifacts
  const artifacts = await store.getArtifacts('task-1');
  console.log('提取到的Artifacts:', artifacts.length);

  // 5. 获取LLM格式的上下文
  const llmContext = await manager.getContextForLLM('task-1');
  console.log('LLM上下文已生成:', llmContext);

  await store.close();
}

async function multiTurnExample() {
  console.log('\n=== 多轮对话示例 ===');

  const store = getDataStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-2', 'session-2', '优化代码性能');

  // 多轮对话
  const turns = [
    { role: 'user' as const, content: '分析React组件性能问题' },
    { role: 'assistant' as const, content: '我发现了3个性能瓶颈' },
    { role: 'user' as const, content: '重点关注useMemo的使用' },
    { role: 'assistant' as const, content: '好的，我会检查useMemo的使用场景' },
    { role: 'user' as const, content: '给出优化建议' },
  ];

  for (let i = 0; i < turns.length; i++) {
    await manager.addMessage('task-2', {
      id: `msg-${i + 1}`,
      ...turns[i],
      metadata: { timestamp: new Date(), tokens: 50 },
    });
  }

  const context = await manager.getContext('task-2');
  if (context) {
    console.log('对话轮次:', context.currentTurn);
    console.log('消息数量:', context.messages.length);
  }

  await store.close();
}

async function compressionExample() {
  console.log('\n=== 上下文压缩示例 ===');

  const store = getDataStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-3', 'session-3', '长任务');

  // 模拟大量消息
  for (let i = 0; i < 25; i++) {
    await manager.addMessage('task-3', {
      id: `msg-${i}`,
      role: 'assistant',
      content: `处理第${i}个文件`,
      metadata: { timestamp: new Date(), tokens: 5000 },
    });
  }

  const context = await manager.getContext('task-3');
  if (context) {
    console.log('总token数:', context.metadata.totalTokens);
    console.log('最后压缩时间:', context.metadata.lastCompressedAt);
    console.log('当前消息数:', context.messages.length);
  }

  // 查看压缩历史
  const history = await store.getCompressionHistory('task-3');
  console.log('压缩次数:', history.length);
  for (const record of history) {
    console.log(`压缩率: ${(record.compressionRatio * 100).toFixed(1)}%`);
  }

  await store.close();
}

async function artifactTrackingExample() {
  console.log('\n=== Artifact跟踪示例 ===');

  const store = getDataStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-4', 'session-4', '文件操作');

  // 包含文件路径的消息
  const messages = [
    '已创建文件 /src/components/UserList.tsx',
    '修改了 /src/utils/api.ts 中的数据获取函数',
    '删除了 /src/old/unused.ts 文件',
    '调用了函数 fetchDataFromAPI',
  ];

  for (let i = 0; i < messages.length; i++) {
    await manager.addMessage('task-4', {
      id: `msg-${i}`,
      role: 'assistant',
      content: messages[i],
      metadata: { timestamp: new Date(), tokens: 30 },
    });
  }

  // 查询所有Artifacts
  const artifacts = await store.getArtifacts('task-4');
  console.log('发现的Artifacts:');
  for (const artifact of artifacts) {
    console.log(`- ${artifact.artifactType}: ${artifact.action} ${artifact.path}`);
  }

  await store.close();
}

// 运行所有示例
async function main() {
  try {
    await basicUsageExample();
    await multiTurnExample();
    await compressionExample();
    await artifactTrackingExample();

    console.log('\n所有示例运行完成！');
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

if (require.main === module) {
  main();
}
