/**
 * 简单测试：Stream 写入是否会导致卡死
 */

import { createClient } from 'redis';

async function testStream() {
  console.log('🧪 开始测试 Stream 写入...\n');

  const testTaskId = `freeze-test-${Date.now()}`;
  console.log(`📝 Task ID: ${testTaskId}`);

  // 检查 Redis 连接
  console.log('\n1️⃣ 检查 Redis 连接...');
  const redis = createClient();
  try {
    await redis.connect();
    const pong = await redis.ping();
    console.log('   ✅ Redis 连接成功:', pong);
  } catch (error) {
    console.error('   ❌ Redis 连接失败:', error.message);
    await redis.quit();
    return;
  }

  // 测试 1: 最简单的数据
  console.log('\n2️⃣ 测试 1: 直接写入 Redis Stream...');
  try {
    const start = Date.now();
    await redis.xAdd(`motia:stream:taskExecution`, '*', {
      groupId: testTaskId,
      id: `${testTaskId}-test1`,
      data: JSON.stringify({
        status: 'test',
        timestamp: new Date().toISOString(),
      }),
    });
    const duration = Date.now() - start;
    console.log(`   ✅ 成功 (${duration}ms)`);
  } catch (error) {
    console.error('   ❌ 失败:', error.message);
    if (error.message.includes('stack') || error.message.includes('recursion')) {
      console.log('   🔍 检测到栈溢出或递归！');
    }
  }

  await redis.quit();
  console.log('\n✅ 测试完成！');
}

testStream().catch(console.error);
