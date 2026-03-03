/**
 * Task Unpin API Step
 *
 * Handles unpinning tasks
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Unpin Task Request Schema
 */
const unpinTaskSchema = _z.object({
  taskId: _z.string().describe('Task ID to unpin'),
});

/**
 * Unpin Task API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'tasks-unpin-api',
  description: 'API endpoint to unpin a task',

  path: '/api/tasks/unpin',
  method: 'POST',

  emits: [],
  virtualSubscribes: [],
  flows: ['api-workflow'],
};

/**
 * Unpin Task Handler
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Unpin Task API: Received request');

  try {
    const body = request.body || {};
    const parsed = unpinTaskSchema.parse(body);

    const dataStore = getDataStore();
    await dataStore.initialize();

    const task = await dataStore.unpinTask(parsed.taskId);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Task unpinned successfully',
        task: {
          id: task.id,
          pinned: task.pinned,
        },
      },
    };
  } catch (error: any) {
    logger.error('Unpin Task API: Error', { error: error.message });

    return {
      status: error.message.includes('not found') ? 404 : 500,
      body: {
        success: false,
        message: error.message || 'Failed to unpin task',
      },
    };
  }
};
