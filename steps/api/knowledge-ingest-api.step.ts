/**
 * POST /api/knowledge/ingest
 * Simple API to ingest knowledge into the knowledge base
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { Pool } from 'pg';

// Simple in-memory cache for the OpenAI API key
// In production, this should come from config
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');

export const bodySchema = z.object({
  tenantId: z.string().default('default'),
  collectionName: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional().default({}),
});

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'knowledge-ingest-api',
  description: 'Ingest knowledge into knowledge base',
  path: '/api/knowledge/ingest',
  method: 'POST',
  emits: [],
  flows: ['api-workflow'],
};

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!EMBEDDING_API_KEY) {
    throw new Error('EMBEDDING_API_KEY or OPENAI_API_KEY environment variable is required');
  }

  const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export const handler = async (request: any, { logger }: any) => {
  try {
    const { tenantId, collectionName, content, metadata } = request.body;

    logger.info('Knowledge ingestion request', {
      tenantId,
      collectionName,
      contentLength: content.length,
    });

    // Generate embedding
    logger.info('Generating embedding...');
    const embedding = await generateEmbedding(content);
    logger.info('Embedding generated', { dimensions: embedding.length });

    // Insert into database
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'myagent',
      user: process.env.DB_USER || 'leo',
      password: process.env.DB_PASSWORD || '',
    });

    const result = await pool.query(
      `INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, collection_name, content)
       DO UPDATE SET metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding
       RETURNING id`,
      [tenantId, collectionName, content, JSON.stringify(metadata), embedding]
    );

    await pool.end();

    logger.info('Knowledge inserted successfully', { id: result.rows[0].id });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: result.rows[0].id,
          tenantId,
          collectionName,
          contentLength: content.length,
          metadata,
        },
      },
    };
  } catch (error: any) {
    logger.error('Failed to ingest knowledge', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
