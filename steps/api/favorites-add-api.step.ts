/**
 * Add to Favorites API Step.
 *
 * Adds an artifact to the user's favorites.
 */

import { z as _z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { getDataStore } from '../../src/core/database/data-store.js';

/**
 * 添加到精选 Request Schema
 */
const addToFavoriteSchema = _z.object({
  artifactId: _z.string().describe('Artifact ID'),
  taskId: _z.string().describe('Task ID'),
});

/**
 * Add to Favorites API Step configuration.
 */
export const config = {
  name: 'favorites-add-api',
  description: 'API endpoint to add an artifact to favorites',

  /**
   * API route configuration.
   */
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/favorites/add' }],

  /**
   * Emit events (none, this is a CRUD API)
   */
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Add to Favorites Handler
 */
export const handler: any = async (context: any) => {
  logger.info('Add to Favorites API: Received request');

  try {
    const body = context.request.body || {};
    const parsed = addToFavoriteSchema.parse(body);

    const dataStore = getDataStore();
    await dataStore.initialize();

    // 检查 artifact 是否存在
    const artifacts = await dataStore.getArtifacts(parsed.taskId);
    const artifact = artifacts.find((a: any) => a.id === parsed.artifactId);

    if (!artifact) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Artifact not found',
        },
      };
    }

    // 检查是否已收藏
    const existing = await dataStore.getFavoriteByArtifactId(parsed.artifactId);
    if (existing) {
      return {
        status: 200,
        body: {
          success: true,
          message: 'Already in favorites',
          favoriteId: existing.id,
        },
      };
    }

    // 添加到精选
    const favoriteId = await dataStore.addFavorite({
      artifactId: parsed.artifactId,
      taskId: parsed.taskId,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Added to favorites',
        favoriteId,
      },
    };
  } catch (error: any) {
    logger.error('Add to Favorites API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to add to favorites',
        error: error.message,
      },
    };
  }
};
