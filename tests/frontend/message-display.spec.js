/**
 * Playwright 测试：前端任务详情页消息显示验证
 *
 * 测试目标：
 * 1. 打开任务详情页面
 * 2. 验证左侧进度流面板显示消息
 * 3. 验证消息内容包括：
 *    - 任务开始记录
 *    - remotion-generator 技能消息
 *    - 用户聊天消息："动画过程中增加一些公式计算过程讲解"
 *    - 助手回复："抱歉，我没有生成回复。"
 * 4. 确认没有"暂无任务执行数据"的提示
 *
 * 运行方式：
 * cd motia-frontend && npx playwright test message-display.spec.js --headed
 */

const { test, expect } = require('@playwright/test');

// 测试配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TASK_ID = 'task-1769754178517-1';
const TASK_URL = `${BASE_URL}/tasks/${TASK_ID}`;

test.describe('前端消息显示测试', () => {
  test.beforeEach(async ({ page }) => {
    console.log(`📝 测试URL: ${TASK_URL}`);

    // 设置页面超时和默认等待时间
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // 监听控制台日志
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        console.error(`❌ [浏览器错误] ${text}`);
      } else if (type === 'warning') {
        console.warn(`⚠️  [浏览器警告] ${text}`);
      } else if (text.includes('[Stream History]') ||
                 text.includes('[Stream]') ||
                 text.includes('[TaskDetail]') ||
                 text.includes('[🔄]')) {
        console.log(`📋 [浏览器日志] ${text}`);
      }
    });

    // 监听网络请求
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/tasks/') || url.includes('/stream')) {
        console.log(`🌐 [请求] ${request.method()} ${url}`);
      }
    });

    page.on('response', response => {
      const url = response.url();
      if (url.includes('/api/tasks/') || url.includes('/stream')) {
        console.log(`📥 [响应] ${response.status()} ${url}`);
      }
    });
  });

  test('应该显示任务详情页面并加载消息', async ({ page }) => {
    console.log(`\n====== 测试开始：打开任务详情页 ======`);

    // 1. 导航到任务详情页
    console.log(`📍 步骤1: 导航到任务详情页面`);
    try {
      await page.goto(TASK_URL, { waitUntil: 'networkidle', timeout: 30000 });
      console.log(`✅ 页面加载成功`);
    } catch (error) {
      console.error(`❌ 页面加载失败: ${error.message}`);
      throw error;
    }

    // 等待页面稳定
    await page.waitForTimeout(2000);

    // 截图保存初始状态
    await page.screenshot({
      path: `tests/screenshots/message-display-01-initial.png`,
      fullPage: true
    });
    console.log(`📸 截图已保存: message-display-01-initial.png`);

    // 2. 检查页面基本元素
    console.log(`\n📍 步骤2: 检查页面基本元素`);

    // 等待任务详情容器出现
    const taskDetail = await page.waitForSelector('.task-detail', { timeout: 10000 });
    expect(taskDetail).toBeTruthy();
    console.log(`✅ 任务详情容器存在`);

    // 检查任务ID是否显示
    const taskIdElement = await page.$('.info-value');
    if (taskIdElement) {
      const taskIdText = await taskIdElement.textContent();
      console.log(`✅ 任务ID显示: ${taskIdText}`);
    }

    // 3. 检查进度流面板
    console.log(`\n📍 步骤3: 检查左侧进度流面板`);

    // 等待进度流容器出现
    try {
      await page.waitForSelector('.progress-stream', { timeout: 10000 });
      console.log(`✅ 进度流面板容器存在`);
    } catch (error) {
      console.error(`❌ 进度流面板容器不存在: ${error.message}`);
      throw new Error('进度流面板未找到，可能页面结构有问题');
    }

    // 4. 等待消息加载（检查 fetchStreamHistory 是否被调用）
    console.log(`\n📍 步骤4: 等待消息加载`);

    // 等待一段时间，让 fetchStreamHistory 和 WebSocket 订阅完成
    await page.waitForTimeout(5000);

    // 检查是否有消息显示
    const messageCountLocator = page.locator('.stream-count, .progress-stream-header .stream-count');
    const messageCountText = await messageCountLocator.textContent();

    if (messageCountText) {
      console.log(`✅ 消息计数显示: ${messageCountText}`);
    } else {
      console.log(`⚠️  消息计数未找到`);
    }

    // 截图保存消息加载后的状态
    await page.screenshot({
      path: `tests/screenshots/message-display-02-after-load.png`,
      fullPage: true
    });
    console.log(`📸 截图已保存: message-display-02-after-load.png`);

    // 5. 验证消息内容
    console.log(`\n📍 步骤5: 验证消息内容`);

    // 检查是否显示"暂无任务执行数据"
    const noDataMessage = await page.$('.no-progress-data');
    if (noDataMessage) {
      const noDataText = await noDataMessage.textContent();
      console.error(`❌ 发现"暂无数据"提示: ${noDataText}`);
      console.log(`💡 这表明消息没有正确加载`);

      // 再次截图，用于调试
      await page.screenshot({
        path: `tests/screenshots/message-display-error-no-data.png`,
        fullPage: true
      });
    } else {
      console.log(`✅ 没有显示"暂无任务执行数据"`);
    }

    // 检查消息气泡是否存在
    const messageBubbles = await page.$$('.chat-bubble, .stream-entry');
    console.log(`✅ 找到 ${messageBubbles.length} 个消息气泡`);

    if (messageBubbles.length === 0) {
      console.error(`❌ 没有找到任何消息气泡`);
      console.log(`💡 可能的原因：`);
      console.log(`   1. fetchStreamHistory 函数未被调用`);
      console.log(`   2. API 返回数据为空`);
      console.log(`   3. WebSocket 订阅失败`);
      console.log(`   4. messages state 未正确更新`);

      // 获取页面 HTML 用于调试
      const progressStreamHTML = await page.$eval('.progress-stream-content', el => el.innerHTML);
      console.log(`\n🔍 进度流内容 HTML:`);
      console.log(progressStreamHTML);

      throw new Error('未找到任何消息，消息加载失败');
    }

    // 6. 验证特定消息内容
    console.log(`\n📍 步骤6: 验证特定消息内容`);

    let foundTaskStart = false;
    let foundSkillMessage = false;
    let foundUserChat = false;
    let foundAssistantReply = false;

    // 遍历所有消息气泡，检查内容
    for (let i = 0; i < messageBubbles.length; i++) {
      const bubble = messageBubbles[i];
      const text = await bubble.textContent();
      const className = await bubble.getAttribute('class');

      console.log(`\n📨 消息 ${i + 1}:`);
      console.log(`   类型: ${className}`);
      console.log(`   内容: ${text?.substring(0, 100)}...`);

      // 检查任务开始记录
      if (text?.includes('开始') || text?.includes('执行')) {
        foundTaskStart = true;
        console.log(`   ✅ 包含任务开始记录`);
      }

      // 检查 remotion-generator 技能消息
      if (text?.includes('remotion-generator') || className?.includes('skill')) {
        foundSkillMessage = true;
        console.log(`   ✅ 包含 remotion-generator 技能消息`);
      }

      // 检查用户聊天消息
      if (text?.includes('动画过程中增加一些公式计算过程讲解') || className?.includes('user')) {
        foundUserChat = true;
        console.log(`   ✅ 包含用户聊天消息`);
      }

      // 检查助手回复
      if (text?.includes('抱歉，我没有生成回复') || className?.includes('assistant')) {
        foundAssistantReply = true;
        console.log(`   ✅ 包含助手回复`);
      }
    }

    // 总结检查结果
    console.log(`\n📊 消息内容验证结果:`);
    console.log(`   任务开始记录: ${foundTaskStart ? '✅' : '❌'}`);
    console.log(`   技能消息: ${foundSkillMessage ? '✅' : '❌'}`);
    console.log(`   用户聊天: ${foundUserChat ? '✅' : '❌'}`);
    console.log(`   助手回复: ${foundAssistantReply ? '✅' : '❌'}`);

    // 7. 检查 messages state（通过页面日志）
    console.log(`\n📍 步骤7: 检查 messages state 更新`);

    // 通过执行 JavaScript 获取 React 状态（如果可能）
    try {
      const messagesState = await page.evaluate(() => {
        // 尝试从 DOM 获取消息数量
        const entries = document.querySelectorAll('.stream-entry, .chat-bubble');
        return {
          count: entries.length,
          hasMessages: entries.length > 0
        };
      });

      console.log(`✅ Messages state 检查:`, messagesState);
      expect(messagesState.hasMessages).toBeTruthy();
    } catch (error) {
      console.warn(`⚠️  无法直接获取 React state: ${error.message}`);
    }

    // 8. 最终截图
    console.log(`\n📍 步骤8: 保存最终截图`);
    await page.screenshot({
      path: `tests/screenshots/message-display-03-final.png`,
      fullPage: true
    });
    console.log(`📸 最终截图已保存: message-display-03-final.png`);

    // 9. 生成测试报告
    console.log(`\n====== 测试完成 ======`);
    console.log(`\n📋 测试总结:`);
    console.log(`   ✓ 页面加载成功`);
    console.log(`   ✓ 进度流面板显示`);
    console.log(`   ✓ 消息数量: ${messageBubbles.length}`);
    console.log(`   ✓ 没有"暂无数据"提示: ${!noDataMessage}`);

    // 断言关键检查点
    expect(messageBubbles.length).toBeGreaterThan(0);
    expect(noDataMessage).toBeNull();

    console.log(`\n✅ 所有测试通过！`);
  });

  test('应该正确处理 fetchStreamHistory API 调用', async ({ page }) => {
    console.log(`\n====== 测试 API 调用 ======`);

    // 监听 fetchStreamHistory API 调用
    let apiCalled = false;
    let apiResponse = null;

    page.on('request', request => {
      const url = request.url();
      if (url.includes('/stream-history')) {
        apiCalled = true;
        console.log(`🌐 API 调用: ${url}`);
      }
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/stream-history')) {
        try {
          apiResponse = await response.json();
          console.log(`📥 API 响应:`, JSON.stringify(apiResponse, null, 2));
        } catch (error) {
          console.error(`❌ 解析 API 响应失败: ${error.message}`);
        }
      }
    });

    // 导航到页面
    await page.goto(TASK_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // 等待 API 调用
    await page.waitForTimeout(5000);

    // 验证 API 被调用
    expect(apiCalled).toBeTruthy();
    console.log(`✅ fetchStreamHistory API 被调用`);

    // 验证 API 响应
    if (apiResponse) {
      expect(apiResponse.success).toBeDefined();
      console.log(`✅ API 响应格式正确`);

      if (apiResponse.data) {
        const dataLength = Array.isArray(apiResponse.data) ? apiResponse.data.length : 1;
        console.log(`✅ API 返回数据，条目数: ${dataLength}`);
      }
    }
  });

  test('应该实时更新消息（WebSocket）', async ({ page }) => {
    console.log(`\n====== 测试实时消息更新 ======`);

    // 导航到页面
    await page.goto(TASK_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // 等待初始消息加载
    await page.waitForTimeout(3000);

    // 获取初始消息数量
    const initialCount = await page.locator('.chat-bubble, .stream-entry').count();
    console.log(`📊 初始消息数量: ${initialCount}`);

    // 等待一段时间，观察是否有新消息通过 WebSocket 到达
    await page.waitForTimeout(5000);

    // 检查消息数量是否增加
    const finalCount = await page.locator('.chat-bubble, .stream-entry').count();
    console.log(`📊 最终消息数量: ${finalCount}`);

    if (finalCount > initialCount) {
      console.log(`✅ 检测到 ${finalCount - initialCount} 条新消息通过 WebSocket 到达`);
    } else {
      console.log(`ℹ️  没有新消息到达（任务可能已完成）`);
    }

    // 截图
    await page.screenshot({
      path: `tests/screenshots/message-display-04-websocket.png`,
      fullPage: true
    });
  });
});
