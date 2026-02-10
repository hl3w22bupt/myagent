/**
 * Add to Favorites API Step.
 *
 * Adds an artifact to the user's favorites.
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

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
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'favorites-add-api',
  description: 'API endpoint to add an artifact to favorites',

  /**
   * API route configuration.
   */
  path: '/api/favorites/add',
  method: 'POST',

  /**
   * Emit events (none, this is a CRUD API)
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['api-workflow'],
};

/**
 * Add to Favorites Handler
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Add to Favorites API: Received request');

  try {
    const body = request.body || {};
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
