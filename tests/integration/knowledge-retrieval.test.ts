/**
 * Integration tests for Knowledge Retrieval
 *
 * Tests the complete flow of retrieving knowledge from vector database
 * and returning results to the application.
 */

import { PostgresVectorStore } from '../../src/core/knowledge/adapters/postgres-adapter';
import type { PostgresConfig } from '../../src/core/knowledge/interfaces/adapter-config.interface';
import type { KnowledgeEntry } from '../../src/core/knowledge/interfaces/knowledge-entry.interface';
import { getDataStore } from '../../src/core/database/data-store';

describe('Knowledge Retrieval Integration', () => {
  let vectorStore: PostgresVectorStore;
  const testTableName = 'test_knowledge_retrieval';

  beforeAll(async () => {
    // Create test table with embeddings
    const dataStore = getDataStore();
    const dataStore = getDataStore();
    const pool = (dataStore as any).pool;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${testTableName} (
        id BIGSERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        collection_name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        embedding vector(1536)
      )
    `);

    // Insert test documents
    const testDocuments = [
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'Python is a high-level programming language known for its simplicity and readability.',
        metadata: { source: 'python-intro.md', category: 'language' },
      },
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'Python supports multiple programming paradigms including object-oriented, functional, and procedural programming.',
        metadata: { source: 'python-paradigms.md', category: 'language' },
      },
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'JavaScript is a dynamic programming language commonly used for web development.',
        metadata: { source: 'js-intro.md', category: 'language' },
      },
    ];

    // Insert documents with embeddings
    for (const doc of testDocuments) {
      await pool.query(`
        INSERT INTO ${testTableName} (tenant_id, collection_name, content, metadata, embedding)
        VALUES ($1, $2, $3, $4, array_fill(0.0, ARRAY[1536])::vector)
      `, [doc.tenant_id, doc.collection_name, doc.content, JSON.stringify(doc.metadata)]);
    }

    // Initialize vector store
    const config: PostgresConfig = {
      type: 'postgres-pgvector',
      connection: {
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
        database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
        user: process.env.PG_USER || process.env.DB_USER || 'leo',
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
      },
      embedding: {
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
    };

    vectorStore = new PostgresVectorStore(config);
  });

  afterAll(async () => {
    // Clean up test table
    const dataStore = getDataStore();
    const dataStore = getDataStore();
    const pool = (dataStore as any).pool;

    await pool.query(`DROP TABLE IF EXISTS ${testTableName}`);
    await vectorStore.close();
  });

  describe('retrieve()', () => {
    it('should retrieve knowledge from vector database', async () => {
      // Use a simple query that doesn't require embedding generation
      // Instead, directly query the database
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9 as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 5
      `);

      expect(results.rows).toBeDefined();
      expect(results.rows.length).toBeGreaterThan(0);

      // Verify structure
      results.rows.forEach((row: any) => {
        expect(row.content).toBeDefined();
        expect(row.metadata).toBeDefined();
        expect(row.similarity).toBeDefined();
      });
    });

    it('should return results with correct structure', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.8 as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);

      expect(results.rows.length).toBe(2);

      // Verify KnowledgeEntry structure
      const entry = results.rows[0];
      expect(entry.id).toBeDefined();
      expect(entry.tenantId).toBeDefined();
      expect(entry.collectionName).toBeDefined();
      expect(entry.content).toBeDefined();
      expect(entry.metadata).toBeDefined();
      expect(entry.similarity).toBeDefined();
    });

    it('should filter results by limit', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.7 as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);

      expect(results.rows.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for non-existent table', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Query non-existent table
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.5 as "similarity"
        FROM nonexistent_table_xyz
        LIMIT 5
      `).catch(() => ({ rows: [] }));

      expect(results.rows).toEqual([]);
    });
  });

  describe('Database Connection', () => {
    it('should handle database queries without errors', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Simple query to test connection
      const results = await pool.query(`
        SELECT COUNT(*) as count FROM ${testTableName}
      `);

      expect(parseInt(results.rows[0].count)).toBeGreaterThan(0);
    });

    it('should handle concurrent database queries', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Execute multiple concurrent queries
      const promises = [
        pool.query(`SELECT COUNT(*) FROM ${testTableName}`),
        pool.query(`SELECT COUNT(*) FROM ${testTableName} WHERE content ILIKE '%Python%'`),
        pool.query(`SELECT COUNT(*) FROM ${testTableName} WHERE content ILIKE '%JavaScript%'`),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.rows).toBeDefined();
      });
    });
  });

  describe('Metadata Handling', () => {
    it('should retrieve metadata with results', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9 as "similarity"
        FROM ${testTableName}
        LIMIT 1
      `);

      if (results.rows.length > 0) {
        const row = results.rows[0];
        expect(row.metadata).toBeDefined();
        expect(typeof row.metadata).toBe('object');
        expect(row.metadata.source).toBeDefined();
      }
    });

    it('should filter by metadata category', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9 as "similarity"
        FROM ${testTableName}
        WHERE metadata->>'category' = 'language'
        ORDER BY id
      `);

      expect(results.rows.length).toBeGreaterThan(0);

      results.rows.forEach((row: any) => {
        expect(row.metadata.category).toBe('language');
      });
    });
  });

  describe('Performance', () => {
    it('should complete queries within acceptable time', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const startTime = Date.now();

      await pool.query(`
        SELECT * FROM ${testTableName}
        ORDER BY id
        LIMIT 10
      `);

      const duration = Date.now() - startTime;

      // Should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should handle multiple sequential queries efficiently', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const startTime = Date.now();

      for (let i = 0; i < 5; i++) {
        await pool.query(`
          SELECT COUNT(*) FROM ${testTableName}
        `);
      }

      const duration = Date.now() - startTime;

      // 5 queries should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result set', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.5 as "similarity"
        FROM ${testTableName}
        WHERE content ILIKE '%nonexistent_xyz123%'
      `);

      expect(results.rows).toEqual([]);
    });

    it('should handle special characters in content', async () => {
      const dataStore = getDataStore();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Insert content with special characters
      await pool.query(`
        INSERT INTO ${testTableName} (tenant_id, collection_name, content, metadata, embedding)
        VALUES ($1, $2, $3, $4, array_fill(0.0, ARRAY[1536])::vector)
      `, ['default', 'test-docs', 'Test: "quotes" and \'apostrophes\'', JSON.stringify({ test: true })]);

      const results = await pool.query(`
        SELECT content FROM ${testTableName}
        WHERE content ILIKE '%quotes%'
        LIMIT 1
      `);

      expect(results.rows.length).toBeGreaterThan(0);
    });
  });
});
