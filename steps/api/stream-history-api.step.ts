/**
 * Get Stream History API Step configuration.
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { taskExecutionStream } from '../streams/task-execution.stream.js';
import { getDataStore } from '../../src/core/database/data-store.js';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage.js';

/**
 * Get Stream History API Step configuration.
 */
export const config = {
  name: 'stream-history-api',
  description: 'API endpoint for fetching stream history for a task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:id/stream-history' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for stream history requests.
 */
const _taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Generate display content for lifecycle events that don't carry explicit text.
 */
function getLifecycleContent(evt: any): string {
  const statusText: Record<string, string> = {
    started: '已启动',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    analyzing: '分析中',
    resolved: '已解析',
    pending: '等待中',
  };
  const typeText: Record<string, string> = {
    task: '任务',
    agent: 'Agent',
    skill: 'Skill',
    delegation_planning: '委派规划',
    delegation_plan: '委派计划',
    task_decomposition: '任务分解',
    intent_analysis: '意图分析',
    ptc_planning: 'PTC 规划',
    awaiting_clarification: '等待澄清',
  };
  const stageText: Record<string, string> = {
    pre: '准备阶段',
    processing: '处理中',
    post: '完成阶段',
  };

  const type = typeText[evt.type] || evt.type || '未知';
  const status = statusText[evt.status] || evt.status || '';
  const stage = stageText[evt.stage] || '';

  const parts = [type];
  if (stage) parts.push(stage);
  if (status) parts.push(`(${status})`);

  return parts.join(' ');
}

/**
 * Stream History handler.
 */
export const handler: any = async (context: any) => {
  const taskId = context.request.pathParams.id;

  logger.info('Stream History API: Received request', { taskId });

  try {
    // Try database first (persisted across restarts)
    let dbEvents: any[] = [];
    try {
      const store = getDataStore();
      const pool = 'getPool' in store && typeof store.getPool === 'function'
        ? store.getPool()
        : null;
      if (pool) {
        const storage = new PostgresTokenUsageStorage(pool);
        await storage.initializeTables();
        dbEvents = await storage.getExecutionEvents(taskId);
      }
    } catch (dbError: any) {
      logger.warn('Stream History API: Failed to read from database', {
        taskId,
        error: dbError.message,
      });
    }

    // Get in-memory stream data (may have newer entries)
    let streamData: any[] = [];
    try {
      const raw = await taskExecutionStream.list(taskId);
      streamData = Array.isArray(raw) ? raw : [raw];
    } catch (streamError: any) {
      logger.warn('Stream History API: Failed to read from stream', {
        taskId,
        error: streamError.message,
      });
    }

    // Merge: DB events + in-memory events, deduplicated by timestamp
    const seenTimestamps = new Set<string>();
    const merged: any[] = [];

    for (const evt of dbEvents) {
      const key = evt.timestamp || evt.taskId;
      if (!seenTimestamps.has(key)) {
        seenTimestamps.add(key);
        merged.push(evt);
      }
    }
    for (const evt of streamData) {
      const key = evt.timestamp || evt.taskId;
      if (!seenTimestamps.has(key)) {
        seenTimestamps.add(key);
        merged.push(evt);
      }
    }

    // Enrich events for frontend rendering compatibility
    for (const evt of merged) {
      // Ensure `id` field exists (frontend uses it for dedup and agent_hook detection)
      if (!evt.id) {
        evt.id = evt.eventId || `${evt.type}-${evt.taskId}-${evt.timestamp}`;
      }

      // Set `category` for agent hook event types so frontend formatAgentHookMessage kicks in.
      // Real-time WebSocket events carry `category: 'agent_hook'`, but persisted events don't.
      const agentHookTypes = ['agent', 'intent_analysis', 'ptc_planning', 'delegation_planning',
        'delegation_plan', 'task_decomposition', 'awaiting_clarification'];
      if (!evt.category && agentHookTypes.includes(evt.type)) {
        evt.category = 'agent_hook';
      }

      // Reconstruct `data` field from metadata.data for frontend formatSkillMessage/etc.
      // Real-time stream events carry a `data` field, but onPersist saves it inside `metadata`.
      if (!evt.data && evt.metadata?.data && typeof evt.metadata.data === 'object') {
        evt.data = evt.metadata.data;
      }

      // Generate display content for events that lack it.
      // Skill events have a generic `task` ("Skill execution (step)") that blocks enrichment,
      // so we check for meaningful task content before skipping.
      const hasMeaningfulTask = evt.task && evt.task.length > 0 && !evt.task.startsWith('Skill execution');
      const hasContent = evt.content || hasMeaningfulTask || evt.message;

      if (!hasContent) {
        // For skill events, generate a better label than the generic fallback
        if (evt.type === 'skill' && evt.skill) {
          const stageLabel = evt.stage === 'pre' ? '开始执行' : evt.stage === 'post' ? '执行完成' : '执行中';
          const statusLabel = evt.status === 'completed' ? '成功' : evt.status === 'failed' ? '失败' : '';
          evt.content = `[${stageLabel}] ${evt.skill}${statusLabel ? ` (${statusLabel})` : ''}`;
        } else {
          evt.content = getLifecycleContent(evt);
        }
      }
    }

    logger.info('Stream History API: Retrieved data', {
      taskId,
      dbCount: dbEvents.length,
      streamCount: streamData.length,
      mergedCount: merged.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        taskId,
        data: merged,
      },
    };
  } catch (error: any) {
    logger.error('Stream History API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch stream history',
        error: error.message,
      },
    };
  }
};
