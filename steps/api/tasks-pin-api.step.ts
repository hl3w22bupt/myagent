/**
 * Task Pin API Step
 *
 * Handles pinning and unpinning tasks
 */

import { z as _z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { getDataStore } from '../../src/core/database/data-store.js';

/**
 * Pin Task Request Schema
 */
const pinTaskSchema = _z.object({
  taskId: _z.string().describe('Task ID to pin'),
});

/**
 * Pin Task API Step configuration.
 */
export const config = {
  name: 'tasks-pin-api',
  description: 'API endpoint to pin a task',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/tasks/pin' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Pin Task Handler
 */
export const handler = async (context: any) => {
  logger.info('Pin Task API: Received request');

  try {
    const body = context.request.body;
    const parsed = pinTaskSchema.parse(body);

    const dataStore = getDataStore();
    await dataStore.initialize();

    const task = await dataStore.pinTask(parsed.taskId);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Task pinned successfully',
        task: {
          id: task.id,
          pinned: task.pinned,
        },
      },
    };
  } catch (error: any) {
    logger.error('Pin Task API: Error', { error: error.message });

    return {
      status: error.message.includes('not found') ? 404 : 500,
      body: {
        success: false,
        message: error.message || 'Failed to pin task',
      },
    };
  }
};
