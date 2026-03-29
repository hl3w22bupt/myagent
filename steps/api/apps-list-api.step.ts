/**
 * GET /api/apps
 * Get all available apps
 */

import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'apps-list-api',
  description: 'Get all available apps',
  path: '/api/apps',
  method: 'GET',
  emits: [],
  flows: ['api-workflow'],
};

export const handler = async (request: any, { logger }: any) => {
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
