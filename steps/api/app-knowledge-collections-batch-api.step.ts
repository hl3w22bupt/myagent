/**
 * App-Knowledge Collections Batch API
 *
 * POST /api/apps/:appId/knowledge-collections/batch
 * Batch configure knowledge collections for an app
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { batchConfigureAppKnowledgeCollections } from '../../src/core/knowledge/app-knowledge-manager.js';

export const config = {
  name: 'app-knowledge-collections-batch-api',
  description: 'Batch configure knowledge collections',
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/apps/:appId/knowledge-collections/batch' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

// Request body schema
const batchConfigSchema = z.object({
  collections: z.array(z.object({
    collectionName: z.string().min(1),
    enabled: z.boolean().optional().default(true),
    priority: z.number().optional().default(0),
  })).min(1),
});

export const handler: any = async (context: any) => {
  try {
    const { appId } = context.request.pathParams;
    const body = context.request.body;

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
