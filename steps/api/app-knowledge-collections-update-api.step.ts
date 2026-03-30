/**
 * App-Knowledge Collections Update API
 *
 * PUT /api/apps/:appId/knowledge-collections/:collectionName
 * Update knowledge collection configuration for an app
 */

import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { addAppKnowledgeCollection } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'app-knowledge-collections-update-api',
  description: 'Update knowledge collection configuration',
  path: '/api/apps/:appId/knowledge-collections/:collectionName',
  method: 'PUT',
  emits: [],
  flows: ['api-workflow'],
};

// Request body schema
const updateCollectionSchema = z.object({
  contentField: z.string().optional().default('content'),
  embeddingField: z.string().optional().default('embedding'),
  threshold: z.number().optional().default(0.7),
  enabled: z.boolean().optional().default(true),
  priority: z.number().optional().default(0),
});

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const { appId, collectionName } = request.pathParams;
    const body = request.body;

    // Validate request body
    const validationResult = updateCollectionSchema.safeParse(body);
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

    const { contentField, embeddingField, threshold, enabled, priority } = validationResult.data;

    logger.info('Updating knowledge collection configuration', {
      appId,
      collectionName,
      contentField,
      embeddingField,
      threshold,
      enabled,
      priority,
    });

    const mapping = await addAppKnowledgeCollection(
      appId,
      collectionName,
      contentField,
      embeddingField,
      threshold,
      enabled,
      priority
    );

    return {
      status: 200,
      body: {
        success: true,
        data: {
          tableName: mapping.table_name,
          contentField: mapping.content_field,
          embeddingField: mapping.embedding_field,
          threshold: mapping.threshold,
          embeddingDimensions: mapping.embedding_dimensions,
          enabled: mapping.enabled,
          priority: mapping.priority,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to update knowledge collection', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to update knowledge collection',
      },
    };
  }
};
