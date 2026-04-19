/**
 * Task Unpin API Step
 *
 * Handles unpinning tasks
 */

import { z as _z } from 'zod';
import { type StepConfig, logger } from 'motia';
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
export const config = {
  name: 'tasks-unpin-api',
  description: 'API endpoint to unpin a task',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/tasks/unpin' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Unpin Task Handler
 */
export const handler = async (context: any) => {
  logger.info('Unpin Task API: Received request');

  try {
    const body = context.request.body;
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
