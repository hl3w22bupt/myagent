/**
 * GET /api/knowledge/datasources/:id/collections
 * Discover collections from data source
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { discoverCollections } from '../../src/core/knowledge/datasource-manager.js';
import { getDataSource } from '../../src/core/knowledge/datasource-store.js';

export const config = {
  name: 'knowledge-datasources-collections-api',
  description: 'Discover collections from data source',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/knowledge/datasources/:id/collections' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler = async (context: any) => {
  try {
    const { id } = context.request?.pathParams ?? context.request?.params ?? {};

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

    logger.info('Discovering collections from data source', { id, name: dataSource.name });

    const collections = await discoverCollections(dataSource);

    return {
      status: 200,
      body: {
        success: true,
        data: {
          dataSourceId: id,
          dataSourceName: dataSource.name,
          collections: collections.map(c => ({
            name: c.name,
            entryCount: c.entryCount,
            hasEmbeddings: c.hasEmbeddings,
          })),
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to discover collections', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
