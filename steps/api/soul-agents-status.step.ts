/**
 * Soul Agents Status API
 *
 * 提供自主智能体状态查询接口
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { soulConfigLoader } from '../../src/core/config/soul-config-loader';
import { soulStateDataService } from '../../src/core/database/soul-data-service';
import { soulExecutionHistoryService } from '../../src/core/database/soul-data-service';
import { ApiRouteConfig } from 'motia';

/**
 * Soul Agents Status API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'soul-agents-status',
  description: '获取自主智能体状态列表',

  path: '/api/soul-agents/status',
  method: 'GET',

  emits: [],
  flows: [],
};

/**
 * Soul Agents Status handler.
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Fetching soul agents status');

  try {
    // 1. 获取所有可用的 Soul 配置
    const availableSouls = await soulConfigLoader.listAvailableSouls();

    // 2. 获取调度器统计信息
    const schedulerStats = soulScheduler.getStats();

    // 3. 获取每个 Soul 的详细信息
    const soulDetails = await Promise.all(
      availableSouls.map(async (soulId) => {
        try {
          // 加载 Soul 配置
          const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

          // 获取该 Soul 的所有实例（包括 IDLE、HIBERNATED、ACTIVE）
          const activeInstances = await soulStateDataService.getAllSoulStates(soulId);

          // 获取休眠实例数量
          const hibernatedCount = activeInstances.filter(
            (instance: any) => instance.state.status === 'HIBERNATED'
          ).length;

          // 获取活跃实例数量
          const activeCount = activeInstances.filter(
            (instance: any) => instance.state.status === 'ACTIVE'
          ).length;

          // 获取空闲实例数量
          const idleCount = activeInstances.filter(
            (instance: any) => instance.state.status === 'IDLE'
          ).length;

          return {
            soulId,
            displayName: soulConfig.display_name,
            description: soulConfig.description || '',
            subagent: soulConfig.subagent,
            primitives: soulConfig.primitives || [],
            goal: soulConfig.goal?.substring(0, 200) + '...', // 截取前200字符

            // 统计信息
            stats: {
              active: activeCount,
              hibernated: hibernatedCount,
              idle: idleCount,
              totalInstances: activeInstances.length
            },

            // 实例列表
            instances: await Promise.all(
              activeInstances.map(async (instance: any) => {
                const instanceData: any = {
                  sessionId: instance.sessionId,
                  userId: instance.sessionId.replace(`soul-${soulId}-`, ''),
                  status: instance.state.status,
                  currentTask: instance.state.currentTask,
                  lastActivity: instance.state.lastActivity,
                  scheduledWakeup: instance.state.scheduledWakeup,
                  statistics: instance.state.statistics
                };

                // For active instances, fetch latest execution record for more details
                if (instance.state.status === 'ACTIVE') {
                  try {
                    const latestExecutions = await soulExecutionHistoryService.getExecutionHistory({
                      soulId,
                      sessionId: instance.sessionId,
                      status: 'running',
                      limit: 1
                    });

                    if (latestExecutions.length > 0) {
                      const latestExecution = latestExecutions[0];
                      instanceData.currentTaskDescription = `触发于 ${latestExecution.triggerSource}`;
                      instanceData.executionStartTime = latestExecution.startedAt;
                      instanceData.executionTriggerSource = latestExecution.triggerSource;
                    }
                  } catch (error) {
                    // Ignore errors fetching execution details
                    console.warn('Failed to fetch latest execution:', error);
                  }
                }

                return instanceData;
              })
            )
          };
        } catch (error: any) {
          logger.error(`Failed to load soul config for ${soulId}`, {
            error: error.message
          });

          return {
            soulId,
            displayName: soulId,
            description: 'Failed to load configuration',
            stats: {
              active: 0,
              hibernated: 0,
              idle: 0,
              totalInstances: 0
            },
            instances: [],
            error: error.message
          };
        }
      })
    );

    // 计算实际的总统计（从数据库中的实例统计）
    const actualSummary = {
      totalSoulTypes: availableSouls.length,
      totalActiveSouls: soulDetails.reduce((sum, soul) => sum + soul.stats.active, 0),
      totalHibernatedSouls: soulDetails.reduce((sum, soul) => sum + soul.stats.hibernated, 0),
      totalSouls: soulDetails.reduce((sum, soul) => sum + soul.stats.totalInstances, 0)
    };

    logger.info('Soul agents status fetched', {
      totalSoulTypes: availableSouls.length,
      totalActive: actualSummary.totalActiveSouls,
      totalHibernated: actualSummary.totalHibernatedSouls,
      totalSouls: actualSummary.totalSouls
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          souls: soulDetails,
          scheduler: schedulerStats,
          summary: actualSummary
        }
      }
    };

  } catch (error: any) {
    logger.error('Failed to fetch soul agents status', {
      error: error.message,
      stack: error.stack
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};
