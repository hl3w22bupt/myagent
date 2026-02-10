/**
 * Favorites API Step.
 *
 * 提供精选产物的增删查分页功能。
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
 * 从精选移除 Request Schema
 */
const removeFromFavoriteSchema = _z.object({
  favoriteId: _z.string().describe('Favorite ID'),
});

/**
 * 获取精选列表 Query Schema
 */
const getFavoritesSchema = _z.object({
  artifactId: _z.string().optional().describe('Check if specific artifact is favorited'),
  page: _z.coerce.number().optional().default(1).describe('Page number (1-indexed)'),
  limit: _z.coerce.number().optional().default(12).describe('Items per page'),
  type: _z.string().optional().describe('Filter by artifact type (image, video, code, etc.)'),
});

/**
 * Favorites API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'favorites-api',
  description: 'API endpoints for managing favorite artifacts',

  /**
   * API route configuration.
   */
  path: '/api/favorites',
  method: 'GET',

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
 * 添加到精选 Handler
 */
export const addToFavoriteHandler = async (request: any, { logger }: any) => {
  logger.info('Favorites API: Add to favorite', { request });

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

    // 添加到精选
    const favoriteId = await dataStore.addFavorite({
      artifactId: parsed.artifactId,
      taskId: parsed.taskId,
    });

    return {
      status: 200,
      body: {
        success: true,
        favoriteId,
        message: 'Added to favorites',
      },
    };
  } catch (error: any) {
    logger.error('Favorites API: Add to favorite error', {
      error: error.message,
    });

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

/**
 * 从精选移除 Handler
 */
export const removeFromFavoriteHandler = async (request: any, { logger }: any) => {
  logger.info('Favorites API: Remove from favorite', { request });

  try {
    const body = request.body || {};
    const parsed = removeFromFavoriteSchema.parse(body);

    const dataStore = getDataStore();
    await dataStore.initialize();

    await dataStore.removeFavorite(parsed.favoriteId);

    return {
      status: 200,
      body: {
        success: true,
        message: 'Removed from favorites',
      },
    };
  } catch (error: any) {
    logger.error('Favorites API: Remove from favorite error', {
      error: error.message,
    });

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

/**
 * Favorites API Handler.
 *
 * Handles GET requests to list favorites with pagination and filtering.
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Favorites API: Get favorites', { request });

  try {
    // 使用 queryParams 获取查询参数
    const queryParams: Record<string, any> = request.queryParams || {};
    const parsed = getFavoritesSchema.parse(queryParams);

    const dataStore = getDataStore();
    await dataStore.initialize();

    // 如果提供了 artifactId，检查单个 artifact 是否被收藏
    if (parsed.artifactId) {
      const isFavorite = await dataStore.isFavorite(parsed.artifactId);

      return {
        status: 200,
        body: {
          success: true,
          isFavorite,
        },
      };
    }

    // 否则返回分页的精选列表
    const page = parsed.page;
    const limit = parsed.limit;
    const type = parsed.type;

    const result = await dataStore.getFavorites({
      page,
      limit,
      type,
    });

    // 为 HTML 类型的产物添加 renderUrl
    // 支持两种情况：
    // 1. artifactType === 'html'
    // 2. artifactType === 'code' 且 metadata.language === 'html'
    const enrichedFavorites = result.favorites.map((favorite: any) => {
      const shouldRender =
        (favorite.artifactType === 'html' && favorite.path) ||
        (favorite.artifactType === 'code' &&
         favorite.metadata?.language === 'html' &&
         favorite.path);

      if (shouldRender) {
        return {
          ...favorite,
          renderUrl: `/media?path=${encodeURIComponent(favorite.path)}`,
        };
      }
      return favorite;
    });

    return {
      status: 200,
      body: {
        success: true,
        favorites: enrichedFavorites,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  } catch (error: any) {
    logger.error('Favorites API: Get favorites error', {
      error: error.message,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to get favorites',
        error: error.message,
      },
    };
  }
};
