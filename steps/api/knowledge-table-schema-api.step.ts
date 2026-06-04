/**
 * Knowledge Table Schema API
 *
 * Returns the schema structure of a knowledge table for UI field mapping configuration
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const config = {
      host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
      database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
      user: process.env.PG_USER || process.env.DB_USER || 'leo',
    };

    if (process.env.PG_PASSWORD || process.env.DB_PASSWORD) {
      (config as any).password = process.env.PG_PASSWORD || process.env.DB_PASSWORD;
    }

    pool = new Pool(config);
  }
  return pool;
}

export const config = {
  name: 'knowledge-table-schema-api',
  description: 'API endpoint for fetching knowledge table schema',
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/knowledge/table-schema' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: any = async (context: any) => {
  const { tableName } = context.request.body;

  // Validate table name to prevent SQL injection
  const tableRegex = /^[a-zA-Z0-9_-]+$/;
  if (!tableRegex.test(tableName)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Invalid table name',
      },
    };
  }

  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);

    if (result.rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          error: `Table '${tableName}' not found`,
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: {
          table: tableName,
          columns: result.rows.map((row: any) => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            default: row.column_default,
          })),
        },
      },
    };
  } catch (error) {
    logger.error('Failed to get table schema', {
      error: (error as Error).message,
    });
    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
