/**
 * GET /api/apps
 * Get all available apps
 */

import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store.js';

export const config = {
  name: 'apps-list-api',
  description: 'Get all available apps',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/apps' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: any = async (_context: any) => {
  try {
    const dataStore = getDataStore();

    // Get all tasks to extract unique apps
    const { tasks } = await dataStore.listTasks({});

    // Extract unique app values
    const appsSet = new Set<string>();
    tasks.forEach((task: any) => {
      if (task.app && task.app.trim()) {
        appsSet.add(task.app.trim());
      }
    });

    // Convert to sorted array
    const apps = Array.from(appsSet).sort();

    logger.info('Fetched available apps', { count: apps.length, apps });

    return {
      status: 200,
      body: {
        success: true,
        data: apps,
      },
    };
  } catch (error: any) {
    logger.error('Failed to fetch apps', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
