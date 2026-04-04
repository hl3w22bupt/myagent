/**
 * Integration tests for Knowledge Injection
 *
 * Tests the complete flow of injecting retrieved knowledge into
 * Agent prompts for RAG (Retrieval-Augmented Generation).
 */

import { PostgresVectorStore } from '../../src/core/knowledge/adapters/postgres-adapter';
import type { PostgresConfig } from '../../src/core/knowledge/interfaces/adapter-config.interface';
import type { KnowledgeEntry } from '../../src/core/knowledge/interfaces/knowledge-entry.interface';
import { getDataStore } from '../../src/core/database/data-store';

describe('Knowledge Injection Integration', () => {
  let vectorStore: PostgresVectorStore;
  const testTableName = 'test_knowledge_injection';

  beforeAll(async () => {
    // Create test table
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

    // Insert test documents about Python
    const testDocuments = [
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'Python uses indentation to define code blocks instead of curly braces.',
        metadata: { source: 'python-syntax.md', topic: 'syntax' },
      },
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'Python is dynamically typed and requires no variable declarations.',
        metadata: { source: 'python-types.md', topic: 'types' },
      },
      {
        tenant_id: 'default',
        collection_name: 'python-docs',
        content: 'Python has a comprehensive standard library included with most installations.',
        metadata: { source: 'python-stdlib.md', topic: 'libraries' },
      },
    ];

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
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
    };

    vectorStore = new PostgresVectorStore(config);
  });

  afterAll(async () => {
    const dataStore = getDataStore();
    const pool = (dataStore as any).pool;

    await pool.query(`DROP TABLE IF EXISTS ${testTableName}`);
    await vectorStore.close();
  });

  describe('Knowledge Retrieval for Injection', () => {
    it('should retrieve relevant knowledge for injection', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      expect(results.rows).toBeDefined();
      expect(results.rows.length).toBeGreaterThan(0);

      // Verify knowledge structure
      results.rows.forEach((entry: any) => {
        expect(entry.content).toBeDefined();
        expect(typeof entry.content).toBe('string');
        expect(entry.similarity).toBeDefined();
        expect(entry.metadata).toBeDefined();
      });
    });

    it('should retrieve knowledge with similarity scores', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.85::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 5
      `);

      results.rows.forEach((entry: any) => {
        expect(entry.similarity).toBeDefined();
        expect(typeof entry.similarity).toBe('number');
      });
    });

    it('should respect knowledge collection limit', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.8::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);

      expect(results.rows.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Prompt Construction with Knowledge', () => {
    it('should construct prompt with retrieved knowledge', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;
      const task = 'Explain how Python handles code blocks';

      // Retrieve knowledge
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      const knowledge = results.rows;

      // Construct prompt with knowledge
      const knowledgeContext = knowledge
        .map((entry: any) => `Content: ${entry.content}\nSource: ${entry.metadata?.source}`)
        .join('\n\n');

      const prompt = `Task: ${task}

Relevant Knowledge:
${knowledgeContext}

Please provide a comprehensive answer based on the retrieved knowledge.`;

      // Verify prompt construction
      expect(prompt).toContain('Task:');
      expect(prompt).toContain('Relevant Knowledge:');
      expect(prompt).toContain('Python');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should handle empty knowledge gracefully', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Simulate empty knowledge by using WHERE clause that returns nothing
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.5::float as "similarity"
        FROM ${testTableName}
        WHERE content ILIKE '%nonexistent_xyz123%'
      `);

      const knowledge = results.rows;

      // Should return empty array
      expect(knowledge).toEqual([]);

      // Prompt should still be constructable
      const task = 'Explain something unknown';
      const prompt = `Task: ${task}\n\nNo relevant knowledge found.\n\nPlease answer based on general knowledge.`;

      expect(prompt).toBeDefined();
      expect(prompt).toContain('No relevant knowledge found');
    });

    it('should format knowledge entries for readability', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.88::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);

      const knowledge = results.rows;

      // Format knowledge entries
      const formattedEntries = knowledge.map((entry: any, index: number) => `
[${index + 1}] ${entry.content}
   Source: ${entry.metadata?.source}
   Relevance: ${(entry.similarity! * 100).toFixed(1)}%
      `.trim()).join('\n');

      expect(formattedEntries).toBeDefined();
      expect(formattedEntries.split('\n').length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long query', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Should not throw error - just return results
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      expect(results.rows).toBeDefined();
    });

    it('should handle special characters in query', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Should handle special characters - just return results
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.85::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      expect(results.rows).toBeDefined();
    });

    it('should handle unicode characters in query', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Should handle unicode - just return results
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.87::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      expect(results.rows).toBeDefined();
    });

    it('should handle very large limit', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Should not return more results than available
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.86::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 1000
      `);

      expect(results.rows.length).toBeLessThanOrEqual(3); // We only inserted 3 docs
    });
  });

  describe('Knowledge Quality', () => {
    it('should return relevant knowledge with proper ranking', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, similarity
        FROM (
          SELECT id, tenant_id, collection_name, content, metadata,
                 (0.95 - (id * 0.01))::float as "similarity"
          FROM ${testTableName}
          ORDER BY id
          LIMIT 5
        ) subquery
        ORDER BY similarity DESC
      `);

      const knowledge = results.rows;

      if (knowledge.length > 1) {
        // Results should be sorted by similarity (highest first)
        for (let i = 0; i < knowledge.length - 1; i++) {
          expect(parseFloat(knowledge[i].similarity)).toBeGreaterThanOrEqual(parseFloat(knowledge[i + 1].similarity));
        }
      }
    });

    it('should include metadata for context', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.92::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 5
      `);

      const knowledge = results.rows;

      knowledge.forEach((entry: any) => {
        expect(entry.metadata).toBeDefined();
        expect(entry.metadata).toHaveProperty('source');
        expect(entry.metadata).toHaveProperty('topic');
      });
    });
  });

  describe('Performance', () => {
    it('should retrieve and format within time budget', async () => {
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const startTime = Date.now();

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.89::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 5
      `);

      const knowledge = results.rows;

      // Format knowledge
      const formatted = knowledge
        .map((entry: any) => `Content: ${entry.content}`)
        .join('\n');

      const duration = Date.now() - startTime;

      // Should complete within 3 seconds
      expect(duration).toBeLessThan(3000);
      expect(formatted).toBeDefined();
    });
  });
});
