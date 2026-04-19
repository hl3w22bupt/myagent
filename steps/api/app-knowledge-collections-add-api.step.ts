/**
 * App-Knowledge Collections Add API
 *
 * POST /api/apps/:appId/knowledge-collections/add
 * Add a knowledge collection to an app
 */

import { type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { addAppKnowledgeCollection } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config = {
  name: 'app-knowledge-collections-add-api',
  description: 'Add knowledge collection to app',
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/apps/:appId/knowledge-collections/add' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

// Request body schema
const addCollectionSchema = z.object({
  collectionName: z.string().min(1),
  contentField: z.string().optional().default('content'),
  embeddingField: z.string().optional().default('embedding'),
  threshold: z.number().optional().default(0.7),
  enabled: z.boolean().optional().default(true),
  priority: z.number().optional().default(0),
});

export const handler: any = async (context: any) => {
  try {
    const { appId } = context.request.pathParams;
    const body = context.request.body;

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

    const { collectionName, contentField, embeddingField, threshold, enabled, priority } = validationResult.data;

    logger.info('Adding knowledge collection to app', {
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
