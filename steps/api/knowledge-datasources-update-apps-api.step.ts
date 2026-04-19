/**
 * PUT /api/knowledge/datasources/:id/apps
 * Update associated apps for a data source
 */

import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { getDataSource, updateDataSourceApps } from '../../src/core/knowledge/datasource-store.js';

const updateAppsSchema = z.object({
  appIds: z.array(z.string()).min(1).max(10),
});

export const config = {
  name: 'knowledge-datasources-update-apps-api',
  description: 'Update associated apps for data source',
  triggers: [{ type: 'http' as const, method: 'PUT' as const, path: '/api/knowledge/datasources/:id/apps' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler = async (context: any) => {
  try {
    const { id } = context.request?.params;
    const body = context.request.body;

    // Validate request
    const validationResult = updateAppsSchema.safeParse(body);
    if (!validationResult.success) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid request body',
          details: validationResult.error.issues,
        },
      };
    }

    const dataSource = await getDataSource(id);
    if (!dataSource) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Data source not found',
        },
      };
    }

    const { appIds } = validationResult.data;

    // Update associated apps
    await updateDataSourceApps(id, appIds);

    logger.info('Updated data source associated apps', { id, appIds });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: dataSource.id,
          name: dataSource.name,
          appIds: appIds,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to update data source apps', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
