/**
 * App-Knowledge Collections Batch API
 *
 * POST /api/apps/:appId/knowledge-collections/batch
 * Batch configure knowledge collections for an app
 */

import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { batchConfigureAppKnowledgeCollections } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'app-knowledge-collections-batch-api',
  description: 'Batch configure knowledge collections',
  path: '/api/apps/:appId/knowledge-collections/batch',
  method: 'POST',
  emits: [],
  flows: ['api-workflow'],
};

// Request body schema
const batchConfigSchema = z.object({
  collections: z.array(z.object({
    collectionName: z.string().min(1),
    enabled: z.boolean().optional().default(true),
    priority: z.number().optional().default(0),
  })).min(1),
});

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const { appId } = request.pathParams;
    const body = request.body;

    // Validate request body
    const validationResult = batchConfigSchema.safeParse(body);
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

    const { collections } = validationResult.data;

    logger.info('Batch configuring knowledge collections for app', {
      appId,
      count: collections.length,
    });

    const mappings = await batchConfigureAppKnowledgeCollections(
      appId,
      collections
    );

    return {
      status: 200,
      body: {
        success: true,
        data: mappings.map((m: any) => ({
          collectionName: m.collection_name,
          enabled: m.enabled,
          priority: m.priority,
        })),
      },
    };
  } catch (error: any) {
    logger.error('Failed to batch configure knowledge collections', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to batch configure knowledge collections',
      },
    };
  }
};
