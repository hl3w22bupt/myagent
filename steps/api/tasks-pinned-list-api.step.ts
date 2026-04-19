/**
 * Pinned Tasks List API Step
 *
 * Returns list of pinned tasks
 */

import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import type { Task } from '../../src/core/database/data-store';

/**
 * Pinned Tasks List API Step configuration.
 */
export const config = {
  name: 'tasks-pinned-list-api',
  description: 'API endpoint to list pinned tasks',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/pinned' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Pinned Tasks List Handler
 */
export const handler = async (_context: any) => {

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
