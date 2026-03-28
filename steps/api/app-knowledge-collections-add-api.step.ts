/**
 * App-Knowledge Collections Add API
 *
 * POST /api/apps/:appId/knowledge-collections/add
 * Add a knowledge collection to an app
 */

import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { addAppKnowledgeCollection } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'app-knowledge-collections-add-api',
  description: 'Add knowledge collection to app',
  path: '/api/apps/:appId/knowledge-collections/add',
  method: 'POST',
  emits: [],
  flows: ['api-workflow'],
};

// Request body schema
const addCollectionSchema = z.object({
  tenantId: z.string().min(1),
  collectionName: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  priority: z.number().optional().default(0),
});

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const { appId } = request.pathParams;
    const body = request.body;

    // Validate request body
    const validationResult = addCollectionSchema.safeParse(body);
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

    const { tenantId, collectionName, enabled, priority } = validationResult.data;

    logger.info('Adding knowledge collection to app', {
      appId,
      tenantId,
      collectionName,
      enabled,
      priority,
    });

    const mapping = await addAppKnowledgeCollection(
      tenantId,
      appId,
      collectionName,
      enabled,
      priority
    );

    return {
      status: 200,
      body: {
        success: true,
        data: {
          collectionName: mapping.collection_name,
          enabled: mapping.enabled,
          priority: mapping.priority,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to add knowledge collection', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to add knowledge collection',
      },
    };
  }
};
