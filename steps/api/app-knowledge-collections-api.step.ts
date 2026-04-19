/**
 * App-Knowledge Collections GET API
 *
 * GET /api/apps/:appId/knowledge-collections
 * Get all knowledge collections for an app
 */

import { type Handlers, type StepConfig, logger } from 'motia';
import { getAppKnowledgeCollections } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config = {
  name: 'app-knowledge-collections-api',
  description: 'Get app knowledge collections',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/apps/:appId/knowledge-collections' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (context) => {
  try {
    const { appId } = context.request.pathParams;

    logger.info('Getting knowledge collections for app', { appId });

    const collections = await getAppKnowledgeCollections(appId);

    return {
      status: 200,
      body: {
        success: true,
        data: collections.map((c: any) => ({
          tableName: c.table_name,
          contentField: c.content_field,
          embeddingField: c.embedding_field,
          threshold: c.threshold,
          embeddingDimensions: c.embedding_dimensions,
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
