/**
 * App-Knowledge Collections Remove API
 *
 * DELETE /api/apps/:appId/knowledge-collections/:collectionName
 * Remove a knowledge collection from an app
 */

import { ApiRouteConfig } from 'motia';
import { removeAppKnowledgeCollection } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'app-knowledge-collections-remove-api',
  description: 'Remove knowledge collection from app',
  path: '/api/apps/:appId/knowledge-collections/:collectionName',
  method: 'DELETE',
  emits: [],
  flows: ['api-workflow'],
};

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const { appId, collectionName } = request.pathParams;
    const queryParams: Record<string, any> = request.queryParams || {};
    const tenantId = queryParams.tenantId || 'default';

    logger.info('Removing knowledge collection from app', {
      appId,
      tenantId,
      collectionName,
    });

    const removed = await removeAppKnowledgeCollection(tenantId, appId, collectionName);

    if (!removed) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Collection not found',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Collection removed successfully',
      },
    };
  } catch (error: any) {
    logger.error('Failed to remove knowledge collection', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to remove knowledge collection',
      },
    };
  }
};
