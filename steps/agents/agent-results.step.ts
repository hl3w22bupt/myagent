/**
 * Agent Results API Step.
 *
 * REST API endpoint for querying agent task execution results.
 * Accepts HTTP requests and returns task results from state.
 *
 * Uses safe state operations to prevent wrapObject stack overflow.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import { getGlobalPostgresStore } from '../../src/core/database/global-store';
import type { Task } from '../../src/core/database/data-store';

// Cache database instance for performance
let cachedStore: any = null;

async function getOptimizedStore() {
  if (!cachedStore) {
    // Use global singleton for PostgreSQL
    const backend = process.env.DATABASE_BACKEND || 'sqlite';
    if (backend === 'postgres') {
      cachedStore = await getGlobalPostgresStore();
      console.log('[AgentResultsAPI] Using global PostgreSQL singleton');
    } else {
      cachedStore = getDataStore();
    }
  }
  return cachedStore;
}

/**
 * Query parameters schema for results API.
 */
export const querySchema = z.object({
  /**
   * Session ID to filter results.
   */
  sessionId: z.string().optional().describe('Filter by session ID'),

  /**
   * Limit number of results.
   */
  limit: z.string().optional().describe('Limit number of results (default: 10)'),

  /**
   * Offset for pagination.
   */
  offset: z.string().optional().describe('Offset for pagination (default: 0)'),

  /**
   * Status to filter results (completed/failed/all).
   */
  status: z.string().optional().describe('Filter by status (completed/failed)'),

  /**
   * Skills to filter results (comma-separated list).
   * Filter tasks that used any of the specified skills.
   */
  skills: z.string().optional().describe('Filter by skills (comma-separated)'),
});

/**
 * Agent Results API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-results-api',
  description: 'REST API endpoint for querying agent task results',

  /**
   * API route configuration.
   */
  path: '/agent/results',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Agent Results API handler.
 *
 * Retrieves paginated task results from state based on query parameters.
 */
export const handler = async (request: any, { logger }: any) => {
  // Parse query parameters - use queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
  }

  const { sessionId, limit, offset, status, skills } = validationResult.data;
  const resultLimit = limit ? parseInt(limit, 10) : 10;
  const resultOffset = offset ? parseInt(offset, 10) : 0;
  const skillsArray = skills ? skills.split(',').map((s: string) => s.trim()) : [];

  logger.info('Agent Results API: Received query request', {
    sessionId,
    limit: resultLimit,
    offset: resultOffset,
    status,
    skills: skillsArray,
  });

  try {
    // Query from database using optimized (cached) store
    const unifiedStore = await getOptimizedStore();

    // Map status filter to TaskStatus (direct mapping, only validate if valid status)
    const validStatuses = ['pending', 'running', 'idle', 'completed', 'failed', 'awaiting_clarification'];
    const taskStatus = status && validStatuses.includes(status) ? status as any : undefined;

    const { tasks, total } = await unifiedStore.listTasks({
      sessionId,
      limit: resultLimit,
      offset: resultOffset,
      status: taskStatus as any,
      skills: skillsArray.length > 0 ? skillsArray : undefined,
    });

    // 批量获取任务的产物数量
    const taskIds = tasks.map((task: Task) => task.id);
    const artifactCounts = await unifiedStore.getArtifactCounts(taskIds);

    // Map database tasks to API response format
    // Handle potentially invalid dates
    const safeToISOString = (date: Date | undefined) => {
      if (!date) return new Date().toISOString();
      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      return date.toISOString();
    };

    const results = tasks.map((task: Task) => ({
      taskId: task.id,
      task: task.task,
      success: task.status === 'completed',
      status: task.status,
      app: task.app,  // 应用标识
      output: task.output,
      error: task.error,
      executionTime: task.executionTime,
      metadata: task.metadata,
      sessionId: task.sessionId,
      timestamp: safeToISOString(task.createdAt),
      pinned: task.pinned || false,  // 置顶状态
      // 添加产物数量
      artifactsCount: artifactCounts.get(task.id) || 0,
    }));

    return {
      status: 200,
      body: {
        success: true,
        count: results.length,
        total: total,
        offset: resultOffset,
        limit: resultLimit,
        hasMore: resultOffset + resultLimit < total,
        results,
      },
    };
  } catch (error: any) {
    logger.error('Agent Results API: Error retrieving results', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve task results',
        error: error.message,
      },
    };
  }
};
