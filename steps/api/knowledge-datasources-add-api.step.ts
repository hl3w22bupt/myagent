/**
 * POST /api/knowledge/datasources
 * Add a new data source
 */

import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { testConnection } from '../../src/core/knowledge/datasource-manager.js';
import { addDataSource, type DataSource } from '../../src/core/knowledge/datasource-store.js';

const addDataSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['postgres-pgvector', 'lancedb']),
  connection: z.object({
    // PostgreSQL fields
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    // LanceDB fields
    uri: z.string().optional(),
    apiKey: z.string().optional(),
  }).refine(
    (data) => {
      // Either PostgreSQL connection or LanceDB URI must be present
      return !!(data.host && data.port && data.database) || !!data.uri;
    },
    { message: "Either PostgreSQL connection (host, port, database) or LanceDB URI is required" }
  ),
});

export const config = {
  name: 'knowledge-datasources-add-api',
  description: 'Add knowledge data source',
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/knowledge/datasources' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler = async (context: any) => {
  try {
    const body = context.body;

    // Validate request
    const validationResult = addDataSourceSchema.safeParse(body);
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

    const { name, type, connection } = validationResult.data;

    // Test connection first
    logger.info('Testing connection to data source', { name, type });
    const testResult = await testConnection({ name, type, connection });

    if (!testResult.success) {
      return {
        status: 400,
        body: {
          success: false,
          error: `Connection failed: ${testResult.error}`,
        },
      };
    }

    // Generate ID and save to database
    const id = `ds-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Build connection object based on type
    const dataSourceConnection: any = connection.host ? {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user || process.env.PG_USER || 'leo',
    } : {
      uri: connection.uri,
      apiKey: connection.apiKey,
    };

    const dataSource: DataSource = {
      id,
      name,
      type,
      connection: dataSourceConnection,
      status: 'connected',
      appIds: [],
      createdAt: new Date().toISOString(),
    };

    await addDataSource(dataSource);

    logger.info('Data source added successfully', { id, name });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: dataSource.id,
          name: dataSource.name,
          type: dataSource.type,
          status: dataSource.status,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to add data source', { error: error.message, stack: error.stack });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
