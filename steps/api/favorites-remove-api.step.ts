/**
 * Remove from Favorites API Step.
 *
 * Removes an artifact from the user's favorites.
 */

import { z as _z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { getDataStore } from '../../src/core/database/data-store.js';

/**
 * 从精选移除 Request Schema
 */
const removeFromFavoriteSchema = _z.object({
  favoriteId: _z.string().describe('Favorite ID'),
});

/**
 * Remove from Favorites API Step configuration.
 */
export const config = {
  name: 'favorites-remove-api',
  description: 'API endpoint to remove an artifact from favorites',

  /**
   * API route configuration.
   */
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/favorites/remove' }],

  /**
   * Emit events (none, this is a CRUD API)
   */
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Remove from Favorites Handler
 */
export const handler: any = async (context: any) => {
  logger.info('Remove from Favorites API: Received request');

  try {
    const body = context.request.body || {};
    const parsed = removeFromFavoriteSchema.parse(body);

    const dataStore = getDataStore();
    await dataStore.initialize();

    // 从精选移除
    const removed = await dataStore.removeFavorite(parsed.favoriteId);

    if (!removed) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Favorite not found',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Removed from favorites',
      },
    };
  } catch (error: any) {
    logger.error('Remove from Favorites API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to remove from favorites',
        error: error.message,
      },
    };
  }
};
