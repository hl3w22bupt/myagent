/**
 * DELETE /api/knowledge/datasources/:id
 * Delete a data source
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataSource, deleteDataSource } from '../../src/core/knowledge/datasource-store.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'knowledge-datasources-delete-api',
  description: 'Delete knowledge data source',
  path: '/api/knowledge/datasources/:id',
  method: 'DELETE',
  emits: [],
  flows: ['api-workflow'],
};

export const handler = async (request: any, { logger }: any) => {
  try {
    const { id } = request.pathParams;

    // Don't allow deleting the default data source
    if (id === 'default') {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Cannot delete default data source',
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

    const deleted = await deleteDataSource(id);

    if (!deleted) {
      return {
        status: 500,
        body: {
          success: false,
          error: 'Failed to delete data source',
        },
      };
    }

    logger.info('Data source deleted successfully', { id, name: dataSource.name });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: dataSource.id,
          name: dataSource.name,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to delete data source', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
