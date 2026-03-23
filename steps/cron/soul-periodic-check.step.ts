/**
 * Soul Agent Periodic Check Cron Step
 *
 * 每 1 分钟触发一次，检查数据库中 scheduled_wakeup 已到的 Soul Agent 实例：
 * - 查询 scheduled_wakeup < NOW() 且状态为 IDLE 的实例
 * - 使用时间窗口优化查询性能（仅查找最近 N 小时内应该触发的实例）
 * - 发送 soul.agent.execute 事件，触发每个 Soul Agent 的自主决策
 * - Soul Agent 会根据上下文判断是否需要采取行动（问候、关心等）
 *
 * 这是数据库驱动的心跳调度，替代了之前的内存单例 MinHeap 方案。
 */

import type { CronConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Soul Agent 状态接口
 */
interface SoulAgentState {
  session_id: string;
  soul_id: string;
  status: 'ACTIVE' | 'IDLE' | 'HIBERNATED' | 'STOPPED';
  last_activity: number | null;
  current_task_id: string | null;
  scheduled_wakeup: Date | null;
  created_at: number;
  updated_at: number;
}

/**
 * 从环境变量获取查询时间窗口（小时）
 */
function getQueryWindowHours(): number {
  const envHours = process.env.SOUL_HEARTBEAT_QUERY_WINDOW_HOURS;
  if (envHours) {
    const hours = parseFloat(envHours);
    if (!isNaN(hours) && hours > 0) {
      return hours;
    }
  }
  return 1; // default: 1 hour
}

/**
 * Cron 配置
 */
export const config: CronConfig = {
  type: 'cron',
  name: 'SoulPeriodicCheck',
  description: 'Periodic check for Soul Agents - triggers every minute (dev)',
  cron: '*/1 * * * *', // 每 1 分钟（开发测试）
  emits: ['soul.agent.execute'],
  flows: ['soul-agent-flow'],
};

/**
 * Cron Handler
 */
export const handler = async ({ logger, emit }: any) => {
  logger.info('[SoulPeriodicCheck] Starting periodic check for Soul Agents');

  const store = getDataStore();
  await store.initialize();

  const queryWindowHours = getQueryWindowHours();
  let totalTriggered = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  try {
    // 获取所有 scheduled_wakeup 已到的 IDLE Soul Agent
    const client = (store as any).pool;
    const result = await client.query(
      `SELECT
        session_id,
        soul_id,
        status,
        last_activity,
        current_task_id,
        scheduled_wakeup,
        created_at,
        updated_at
       FROM soul_states
       WHERE status = 'IDLE'
         AND scheduled_wakeup IS NOT NULL
         AND scheduled_wakeup < NOW()
         AND scheduled_wakeup > NOW() - INTERVAL '${queryWindowHours} hours'
       ORDER BY scheduled_wakeup ASC`
    );

    const soulStates: SoulAgentState[] = result.rows;

    logger.info('[SoulPeriodicCheck] Found Soul Agents with scheduled wakeup', {
      total: soulStates.length,
      queryWindowHours,
    });

    if (soulStates.length === 0) {
      logger.info('[SoulPeriodicCheck] No Soul Agents to trigger');
      return;
    }

    // 触发每个 Soul Agent
    for (const soulState of soulStates) {
      try {
        // 构建触发数据
        const triggerData = {
          trigger_time: new Date().toISOString(),
          taskId: soulState.current_task_id,  // ← 包含 taskId（如果有）
          context: {
            source: 'periodic_check',
            data: {
              reason: 'Scheduled wakeup - heartbeat triggered',
              scheduled_wakeup: soulState.scheduled_wakeup
                ? new Date(soulState.scheduled_wakeup).toISOString()
                : null,
              last_interaction: soulState.last_activity
                ? new Date(soulState.last_activity).toISOString()
                : null,
            },
          },
        };

        // 发送 soul.agent.execute 事件
        await emit({
          topic: 'soul.agent.execute',
          data: {
            sessionId: soulState.session_id,
            soulId: soulState.soul_id,
            taskId: soulState.current_task_id,  // ← 包含 taskId
            ...triggerData,
          },
        });

        totalTriggered++;
        logger.info('[SoulPeriodicCheck] Triggered Soul Agent', {
          sessionId: soulState.session_id,
          soulId: soulState.soul_id,
          scheduledWakeup: soulState.scheduled_wakeup,
        });
      } catch (error: any) {
        totalFailed++;
        logger.error('[SoulPeriodicCheck] Failed to trigger Soul Agent', {
          sessionId: soulState.session_id,
          soulId: soulState.soul_id,
          error: error.message,
        });
      }
    }

    logger.info('[SoulPeriodicCheck] Periodic check complete', {
      total: soulStates.length,
      triggered: totalTriggered,
      skipped: totalSkipped,
      failed: totalFailed,
    });
  } catch (error: any) {
    logger.error('[SoulPeriodicCheck] Fatal error', {
      error: error.message,
      stack: error.stack,
    });
  }
};
