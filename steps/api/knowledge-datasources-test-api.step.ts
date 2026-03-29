/**
 * POST /api/knowledge/datasources/:id/test
 * Test data source connection
 */

import { ApiRouteConfig } from 'motia';
import { testConnection } from '../../src/core/knowledge/datasource-manager.js';
import { getDataSource, updateDataSourceStatus } from '../../src/core/knowledge/datasource-store.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'knowledge-datasources-test-api',
  description: 'Test data source connection',
  path: '/api/knowledge/datasources/:id/test',
  method: 'POST',
  emits: [],
  flows: ['api-workflow'],
};

export const handler = async (request: any, { logger }: any) => {
  try {
    const { id } = request.pathParams;

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

    logger.info('Testing data source connection', { id, name: dataSource.name });

    const result = await testConnection(dataSource);

    if (result.success) {
      // Update status in database
      await updateDataSourceStatus(id, 'connected');
    } else {
      await updateDataSourceStatus(id, 'error');
    }

    return {
      status: 200,
      body: {
        success: result.success,
        message: result.success ? 'Connection successful' : `Connection failed: ${result.error}`,
      },
    };
  } catch (error: any) {
    logger.error('Failed to test data source', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
