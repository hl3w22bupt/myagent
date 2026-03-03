/**
 * Pinned Tasks List API Step
 *
 * Returns list of pinned tasks
 */

import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import type { Task } from '../../src/core/database/data-store';

/**
 * Pinned Tasks List API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'tasks-pinned-list-api',
  description: 'API endpoint to list pinned tasks',

  path: '/api/tasks/pinned',
  method: 'GET',

  emits: [],
  virtualSubscribes: [],
  flows: ['api-workflow'],
};

/**
 * Pinned Tasks List Handler
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Pinned Tasks List API: Received request');

  try {
    const dataStore = getDataStore();
    await dataStore.initialize();

    const tasks = await dataStore.listPinnedTasks();

    return {
      status: 200,
      body: {
        success: true,
        tasks: tasks.map((task: Task) => ({
          id: task.id,
          task: task.task,
          sessionId: task.sessionId,
          status: task.status,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          pinned: task.pinned,
        })),
        total: tasks.length,
      },
    };
  } catch (error: any) {
    logger.error('Pinned Tasks List API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Failed to fetch pinned tasks',
      },
    };
  }
};
