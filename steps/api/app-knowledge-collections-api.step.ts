/**
 * App-Knowledge Collections GET API
 *
 * GET /api/apps/:appId/knowledge-collections
 * Get all knowledge collections for an app
 */

import { ApiRouteConfig } from 'motia';
import { getAppKnowledgeCollections } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'app-knowledge-collections-api',
  description: 'Get app knowledge collections',
  path: '/api/apps/:appId/knowledge-collections',
  method: 'GET',
  emits: [],
  flows: ['api-workflow'],
};

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const { appId } = request.pathParams;

    logger.info('Getting knowledge collections for app', { appId });

    const collections = await getAppKnowledgeCollections(appId);

    return {
      status: 200,
      body: {
        success: true,
        data: collections.map((c: any) => ({
          collectionName: c.collection_name,
          enabled: c.enabled,
          priority: c.priority,
        })),
      },
    };
  } catch (error: any) {
    logger.error('Failed to get knowledge collections', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to get knowledge collections',
      },
    };
  }
};
