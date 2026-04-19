/**
 * Knowledge Collections API
 *
 * GET /api/knowledge/list
 * List all available knowledge collections
 */

import { type Handlers, type StepConfig, logger } from 'motia';

export const config = {
  name: 'knowledge-collections-api',
  description: 'List all available knowledge collections',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/knowledge/list' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (context) => {
  try {
    const queryParams: Record<string, any> = context.request.queryParams || {};
    const tenantId = queryParams.tenantId || 'default';

    logger.info('Getting all knowledge collections', { tenantId });

    // Query to get all collections with their entry counts
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
      database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
      user: process.env.PG_USER || process.env.DB_USER || 'leo',
      password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
    });

    const query = `
      SELECT
        tenant_id,
        collection_name,
        COUNT(*) as entry_count,
        MIN(created_at) as created_at,
        MAX(updated_at) as updated_at
      FROM knowledge
      WHERE tenant_id = $1
      GROUP BY tenant_id, collection_name
      ORDER BY collection_name
    `;

    const result = await pool.query(query, [tenantId]);

    const collections = result.rows.map((row: any) => ({
      collectionName: row.collection_name,
      entryCount: parseInt(row.entry_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    await pool.end();

    return {
      status: 200,
      body: {
        success: true,
        data: collections,
      },
    };
  } catch (error: any) {
    logger.error('Failed to get knowledge collections', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message || 'Failed to get knowledge collections',
      },
    };
  }
};
