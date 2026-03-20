/**
 * 应用触发器示例
 *
 * 展示如何使用 Soul Agent 的触发器系统
 */

import { z } from 'zod';

/**
 * 示例 1: 定时检查触发器（Cron）
 *
 * 每 2 小时检查一次用户状态，让 Soul 自己判断是否需要行动
 */
export const periodicCheckTrigger = {
  type: 'cron',
  cron: '0 */2 * * *',  // 每 2 小时
  handler: async (context: any) => {
    console.log('[AppTrigger] Running periodic check');

    // TODO: 从数据库获取活跃用户列表
    const users = await getActiveUsers();

    for (const user of users) {
      const soulId = 'emotional-girlfriend-lively';
      const userId = user.id;
      const sessionId = `soul-${soulId}-${userId}`;

      // 构建触发上下文
      const triggerContext = {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'periodic_check',
          data: {
            user_name: user.name,
            current_hour: new Date().getHours(),
            date: new Date().toISOString().split('T')[0]
          }
        }
      };

      // 调用 Soul API
      await context.executeSoul(soulId, userId, triggerContext);
    }
  }
};

/**
 * 示例 2: 用户打开应用触发器（API）
 *
 * 当用户打开应用时触发
 */
export const userOpenAppTrigger = {
  type: 'api',
  method: 'POST',
  path: '/app/user/open',
  schema: z.object({
    userId: z.string(),
    reason: z.string().optional()
  }),
  handler: async (request: any, context: any) => {
    const { userId, reason = 'Manual open' } = request.body;

    console.log(`[AppTrigger] User opened app: ${userId}, reason: ${reason}`);

    const soulId = 'emotional-girlfriend-lively';

    const triggerContext = {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_open_app',
        data: {
          reason
        }
      }
    };

    return await context.executeSoul(soulId, userId, triggerContext);
  }
};

/**
 * 示例 3: 用户消息触发器（Event）
 *
 * 当用户发送消息时触发
 */
export const userMessageTrigger = {
  type: 'event',
  event: 'user_message',
  handler: async (event: any, context: any) => {
    const { userId, message } = event.data;

    console.log(`[AppTrigger] User message: ${userId}`);

    const soulId = 'emotional-girlfriend-lively';

    const triggerContext = {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: {
          message
        }
      }
    };

    await context.executeSoul(soulId, userId, triggerContext);
  }
};

/**
 * 示例 4: 情绪变化触发器（Event）
 *
 * 当检测到用户情绪变化时触发
 */
export const moodChangeTrigger = {
  type: 'event',
  event: 'user_mood_changed',
  handler: async (event: any, context: any) => {
    const { userId, mood, consecutiveCount } = event.data;

    console.log(`[AppTrigger] User mood changed: ${userId}, mood: ${mood}`);

    // 只在情绪低落且连续时触发
    if (mood === 'sad' && consecutiveCount >= 3) {
      const soulId = 'emotional-girlfriend-lively';

      const triggerContext = {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'mood_change',
          data: {
            detected_mood: mood,
            consecutive_count: consecutiveCount
          }
        }
      };

      await context.executeSoul(soulId, userId, triggerContext);
    }
  }
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取活跃用户列表
 * TODO: 从数据库获取实际用户列表
 */
async function getActiveUsers(): Promise<Array<{ id: string; name: string }>> {
  // 模拟数据，实际应该从数据库查询
  return [
    { id: 'user1', name: '小明' },
    { id: 'user2', name: '小红' }
  ];
}
