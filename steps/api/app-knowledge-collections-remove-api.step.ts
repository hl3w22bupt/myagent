/**
 * App-Knowledge Collections Remove API
 *
 * DELETE /api/apps/:appId/knowledge-collections/:collectionName
 * Remove a knowledge collection from an app
 */

import { type StepConfig, logger } from 'motia';
import { removeAppKnowledgeCollection } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config = {
  name: 'app-knowledge-collections-remove-api',
  description: 'Remove knowledge collection from app',
  triggers: [{ type: 'http' as const, method: 'DELETE' as const, path: '/api/apps/:appId/knowledge-collections/:collectionName' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: any = async (context: any) => {
  try {
    const { appId, collectionName } = context.request.pathParams;

    logger.info('Removing knowledge collection from app', {
      appId,
      collectionName,
    });

    const removed = await removeAppKnowledgeCollection(appId, collectionName);

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
