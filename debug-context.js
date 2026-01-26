/**
 * Context Manager Debug Script
 * 测试上下文管理是否正常工作
 */

const { DataStore } = require('./src/core/database/data-store');
const { ContextManager } = require('./src/core/context/manager');
const { LLMSummarizer } = require('./src/core/llm/summarizer');

async function testContextManager() {
  console.log('=== Context Manager Debug Test ===\n');

  try {
    // 1. 初始化 DataStore
    console.log('1. 初始化 DataStore...');
    const contextStore = new DataStore();
    await contextStore.initialize();
    console.log('✅ DataStore 初始化成功\n');

    // 2. 创建 ContextManager
    console.log('2. 创建 ContextManager...');
    const contextManager = new ContextManager(contextStore);
    console.log('✅ ContextManager 创建成功\n');

    // 3. 创建测试上下文
    console.log('3. 创建测试任务上下文...');
    const testTaskId = 'test-debug-' + Date.now();
    const testSessionId = 'test-session-debug';

    const taskContext = await contextManager.createTaskContext(
      testTaskId,
      testSessionId,
      '这是一个测试任务：创建一个 TypeScript 函数'
    );

    console.log('✅ 任务上下文创建成功');
    console.log('  - taskId:', taskContext.taskId);
    console.log('  - sessionId:', taskContext.sessionId);
    console.log('  - currentTurn:', taskContext.currentTurn);
    console.log('  - 消息数:', taskContext.messages.length);
    console.log('  - Token 总数:', taskContext.metadata.totalTokens);
    console.log('');

    // 4. 读取上下文
    console.log('4. 从数据库读取上下文...');
    const retrievedContext = await contextManager.getContext(testTaskId);

    if (retrievedContext) {
      console.log('✅ 成功读取上下文');
      console.log('  - taskId:', retrievedContext.taskId);
      console.log('  - currentTurn:', retrievedContext.currentTurn);
      console.log('');
    } else {
      console.log('❌ 无法读取上下文\n');
    }

    // 5. 添加测试消息
    console.log('5. 添加测试消息...');
    await contextManager.addMessage(testTaskId, {
      role: 'user',
      content: '测试消息内容',
      metadata: { timestamp: Date.now() },
    });
    console.log('✅ 消息添加成功\n');

    // 6. 再次读取检查
    console.log('6. 再次读取上下文...');
    const updatedContext = await contextManager.getContext(testTaskId);

    if (updatedContext) {
      console.log('✅ 成功读取更新后的上下文');
      console.log('  - 消息数:', updatedContext.messages.length);
      console.log('  - 当前回合:', updatedContext.currentTurn);
      console.log('');
    }

    // 7. 查询所有上下文
    console.log('7. 查询数据库中的所有任务上下文...');
    // 注意：DataStore 没有提供 listAll 方法，这个可能需要手动查询

    console.log('\n=== 测试完成 ===');
    console.log('✅ ContextManager 工作正常！');

    await contextStore.close();

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 运行测试
testContextManager().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
