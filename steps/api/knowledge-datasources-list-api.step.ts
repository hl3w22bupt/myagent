/**
 * GET /api/knowledge/datasources
 * List all data sources
 */

import { type StepConfig, logger } from 'motia';
import { getAllDataSources } from '../../src/core/knowledge/datasource-store.js';

export const config = {
  name: 'knowledge-datasources-list-api',
  description: 'List all knowledge data sources',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/knowledge/datasources' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler = async (context: any) => {
  try {
    const sources = await getAllDataSources();

    return {
      status: 200,
      body: {
        success: true,
        data: sources.map(source => ({
          id: source.id,
          name: source.name,
          type: source.type,
          connection: {
            host: source.connection.host,
            port: source.connection.port,
            database: source.connection.database,
          },
          embedding: {
            model: source.embedding_model,
            dimensions: source.embedding_dimensions,
            baseURL: source.embedding_base_url,
          },
          status: source.status,
          appIds: source.appIds,
          createdAt: source.createdAt,
        })),
      },
    };
  } catch (error: any) {
    logger.error('Failed to list data sources', { error: error.message });
    return {
      status: 500,
      body: { success: false, error: error.message },
    };
  }
};
