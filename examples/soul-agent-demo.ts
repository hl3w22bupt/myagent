/**
 * Soul Agent Demo Application
 *
 * 演示如何使用 Soul Agent 系统
 * 展示三种触发方式：API 触发、Cron 触发、事件触发
 */

import { soulScheduler } from '../src/core/scheduler/soul-scheduler';
import { soulContextDataService } from '../src/core/database/soul-data-service';
import { soulStateDataService } from '../src/core/database/soul-data-service';

/**
 * 演示配置
 */
const DEMO_CONFIG = {
  soulId: 'emotional-girlfriend-lively',
  userId: 'demo-user-123',
  userName: '小明',
};

/**
 * 1. API 触发演示 - 用户主动发送消息
 */
async function demoApiTrigger() {
  console.log('\n=== 演示 1: API 触发（用户发送消息） ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    // 激活 Soul Agent
    const soulAgent = await soulScheduler.activateSoul(DEMO_CONFIG.soulId, sessionId);

    // 模拟用户消息（实际应用中通过 HTTP API）
    const userMessage = {
      role: 'user',
      content: '我今天工作很累，想休息一下',
      timestamp: Date.now()
    };

    // 添加到对话历史
    await soulContextDataService.addConversationMessage(
      sessionId,
      'user',
      userMessage.content
    );

    // 执行 Soul Agent
    const result = await soulAgent.execute({
      trigger_time: new Date().toISOString(),
      context: {
        source: 'api',
        data: {
          type: 'user_message',
          message: userMessage
        }
      }
    });

    console.log('✅ API 触发执行完成');
    console.log('Agent 响应:', result);

  } catch (error: any) {
    console.error('❌ API 触发失败:', error.message);
  }
}

/**
 * 2. Cron 触发演示 - 定时主动问候
 */
async function demoCronTrigger() {
  console.log('\n=== 演示 2: Cron 触发（定时主动问候） ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    const soulAgent = await soulScheduler.activateSoul(DEMO_CONFIG.soulId, sessionId);

    // 模拟定时触发（实际应用中通过 cron job）
    const cronTrigger = {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'cron',
        data: {
          type: 'periodic_check',
          cron_expression: '0 */2 * * *', // 每2小时检查一次
          current_hour: new Date().getHours(),
          last_interaction_hours: 25 // 超过24小时未互动
        }
      }
    };

    const result = await soulAgent.execute(cronTrigger);

    console.log('✅ Cron 触发执行完成');
    console.log('Agent 决策:', result);

  } catch (error: any) {
    console.error('❌ Cron 触发失败:', error.message);
  }
}

/**
 * 3. 事件触发演示 - 系统事件
 */
async function demoEventTrigger() {
  console.log('\n=== 演示 3: 事件触发（系统事件） ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    const soulAgent = await soulScheduler.activateSoul(DEMO_CONFIG.soulId, sessionId);

    // 模拟事件触发（实际应用中通过事件系统）
    const eventTrigger = {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'event',
        data: {
          type: 'user_mood_change',
          event_name: 'user_mood_detected',
          detected_mood: 'sad', // 检测到用户情绪低落
          confidence: 0.85,
          detection_method: 'sentiment_analysis'
        }
      }
    };

    const result = await soulAgent.execute(eventTrigger);

    console.log('✅ 事件触发执行完成');
    console.log('Agent 决策:', result);

  } catch (error: any) {
    console.error('❌ 事件触发失败:', error.message);
  }
}

/**
 * 4. 上下文管理演示
 */
async function demoContextManagement() {
  console.log('\n=== 演示 4: 上下文管理 ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    // 初始化用户档案
    await soulContextDataService.saveSoulContext(
      sessionId,
      DEMO_CONFIG.userId,
      {
        name: DEMO_CONFIG.userName,
        age: 25,
        interests: ['游戏', '电影', '音乐'],
        personality: '内向、温暖',
        preferences: {
          communicationStyle: '温柔鼓励',
          topics: ['工作压力', '生活分享', '兴趣讨论']
        }
      },
      {
        intimacy: 75, // 亲密度 75/100
        chatDays: 15, // 聊天15天
        lastInteraction: new Date().toISOString(),
        nickname: '小糖',
        moodHistory: [
          { date: '2026-03-18', mood: '开心' },
          { date: '2026-03-19', mood: '平静' },
          { date: '2026-03-20', mood: '疲惫' }
        ]
      },
      []
    );

    // 添加一些历史对话
    await soulContextDataService.addConversationMessage(
      sessionId,
      'user',
      '今天上班好累啊'
    );

    await soulContextDataService.addConversationMessage(
      sessionId,
      'assistant',
      '抱抱你～辛苦啦！想吃点什么好吃的放松一下吗？🍜'
    );

    // 读取上下文
    const context = await soulContextDataService.getSoulContext(sessionId);

    console.log('✅ 上下文初始化完成');
    console.log('用户档案:', context?.userProfile);
    console.log('关系状态:', context?.relationshipState);
    console.log('对话轮数:', context?.conversationRounds.length);

  } catch (error: any) {
    console.error('❌ 上下文管理失败:', error.message);
  }
}

/**
 * 5. 状态查询演示
 */
async function demoStateQuery() {
  console.log('\n=== 演示 5: 状态查询 ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    // 查询 Soul 状态
    const soulState = await soulStateDataService.getSoulState(sessionId);

    if (soulState) {
      console.log('✅ Soul 状态:');
      console.log('  状态:', soulState.status);
      console.log('  当前任务:', soulState.currentTask);
      console.log('  最后活动:', soulState.lastActivity ? new Date(soulState.lastActivity).toLocaleString() : '未设置');
      console.log('  计划唤醒:', soulState.scheduledWakeup ? new Date(soulState.scheduledWakeup).toLocaleString() : '未设置');
      console.log('  统计:', soulState.statistics);
    } else {
      console.log('❌ 未找到 Soul 状态');
    }

    // 查询调度器统计
    const stats = soulScheduler.getStats();
    console.log('\n✅ 调度器统计:');
    console.log('  活跃 Soul 数:', stats.activeSouls);
    console.log('  休眠 Soul 数:', stats.hibernatedSouls);
    console.log('  总 Soul 数:', stats.totalSouls);

  } catch (error: any) {
    console.error('❌ 状态查询失败:', error.message);
  }
}

/**
 * 6. 休眠和唤醒演示
 */
async function demoHibernation() {
  console.log('\n=== 演示 6: 休眠和唤醒 ===\n');

  const sessionId = `soul-${DEMO_CONFIG.soulId}-${DEMO_CONFIG.userId}`;

  try {
    const soulAgent = await soulScheduler.activateSoul(DEMO_CONFIG.soulId, sessionId);

    console.log('✅ Soul 已激活');
    console.log('  Session ID:', sessionId);

    // 进入休眠
    await soulAgent.enterHibernation('演示休眠');
    console.log('✅ Soul 已进入休眠');

    // 验证休眠状态
    const soulState = await soulStateDataService.getSoulState(sessionId);
    console.log('  休眠状态:', soulState?.status);

    // 唤醒
    await soulScheduler.activateSoul(DEMO_CONFIG.soulId, sessionId);
    console.log('✅ Soul 已唤醒');

    const wokenState = await soulStateDataService.getSoulState(sessionId);
    console.log('  当前状态:', wokenState?.status);

  } catch (error: any) {
    console.error('❌ 休眠/唤醒失败:', error.message);
  }
}

/**
 * 主函数：运行所有演示
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Soul Agent 演示应用 - 小糖（活泼女友）           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\n📋 演示说明:');
  console.log('  - Soul ID: emotional-girlfriend-lively');
  console.log('  - 用户 ID: demo-user-123');
  console.log('  - 用户名: 小明');

  try {
    // 1. 初始化上下文
    await demoContextManagement();

    // 2. API 触发演示
    await demoApiTrigger();

    // 等待一下，让 Agent 处理
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Cron 触发演示
    await demoCronTrigger();

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 事件触发演示
    await demoEventTrigger();

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. 状态查询
    await demoStateQuery();

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 6. 休眠和唤醒演示
    await demoHibernation();

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║           所有演示完成！                              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

  } catch (error: any) {
    console.error('\n❌ 演示执行失败:', error);
    console.error(error.stack);
  }
}

// 运行演示
if (require.main === module) {
  main().catch(console.error);
}

export {
  demoApiTrigger,
  demoCronTrigger,
  demoEventTrigger,
  demoContextManagement,
  demoStateQuery,
  demoHibernation
};
