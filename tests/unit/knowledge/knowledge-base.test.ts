/**
 * MyAgent Knowledge Base Unit Tests
 *
 * Tests for KnowledgeBase class covering:
 * - Knowledge addition and validation
 * - Vector similarity retrieval
 * - Content sanitization
 * - Embedding caching
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { KnowledgeBase } from '../../../src/core/knowledge/knowledge-base';
import { Pool } from 'pg';

// Mock OpenAI API to avoid external dependencies
const mockCreate = jest.fn().mockResolvedValue({
  data: [{
    embedding: Array(1536).fill(0.1).map((_, i) => Math.sin(i * 0.01)), // Fake but consistent embedding
  }],
});

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockCreate,
    },
  })),
}));

// Test database configuration
const testDbConfig = {
  host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
  user: process.env.PG_USER || 'leo',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
};

const testTenantId = 'test-tenant';
const testCollection = 'test-collection';

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;
  let pool: Pool;

  beforeAll(async () => {
    // Create a connection pool for test cleanup
    pool = new Pool(testDbConfig);

    // Initialize KnowledgeBase
    kb = new KnowledgeBase({
      db: testDbConfig,
      openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
      embeddingModel: 'text-embedding-3-small',
    });
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM knowledge WHERE tenant_id = $1', [testTenantId]);

    // Close connections
    await kb.close();
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up before each test
    await pool.query('DELETE FROM knowledge WHERE tenant_id = $1 AND collection_name = $2', [
      testTenantId,
      testCollection,
    ]);
  });

  describe('addKnowledge', () => {
    it('should add knowledge successfully', async () => {
      const content = 'This is a test knowledge entry';
      const metadata = { source: 'test', category: 'example' };

      const id = await kb.addKnowledge(testTenantId, testCollection, content, metadata);

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');

      // Verify the knowledge was stored
      const result = await pool.query(
        'SELECT * FROM knowledge WHERE id = $1',
        [id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].content).toBe(content);
      expect(result.rows[0].metadata).toEqual(metadata);
      expect(result.rows[0].embedding).toBeDefined();
      expect(result.rows[0].embedding.length).toBe(1536); // text-embedding-3-small dimension
    });

    it('should validate collection names', async () => {
      const invalidNames = [
        'invalid collection',  // spaces not allowed
        'invalid/collection',  // slash not allowed
        'invalid.collection',  // dot not allowed
        'invalid;collection',  // semicolon not allowed
      ];

      for (const invalidName of invalidNames) {
        await expect(
          kb.addKnowledge(testTenantId, invalidName, 'test content')
        ).rejects.toThrow('Invalid collection name');
      }

      const validNames = [
        'valid-collection',
        'valid_collection',
        'ValidCollection123',
      ];

      for (const validName of validNames) {
        const id = await kb.addKnowledge(testTenantId, validName, 'test content');
        expect(id).toBeDefined();

        // Clean up
        await pool.query(
          'DELETE FROM knowledge WHERE tenant_id = $1 AND collection_name = $2',
          [testTenantId, validName]
        );
      }
    });

    it('should sanitize content', async () => {
      const maliciousContent = 'Test content <script>alert("xss")</script>; DROP TABLE users; --';
      const sanitizedContent = 'Test content ; DROP TABLE users; --';

      const id = await kb.addKnowledge(testTenantId, testCollection, maliciousContent);

      const result = await pool.query('SELECT content FROM knowledge WHERE id = $1', [id]);

      // Content should be sanitized (HTML tags removed)
      expect(result.rows[0].content).not.toContain('<script>');
      expect(result.rows[0].content).not.toContain('</script>');
    });

    it('should handle empty content', async () => {
      await expect(
        kb.addKnowledge(testTenantId, testCollection, '   ')
      ).rejects.toThrow('Content cannot be empty');
    });

    it('should update existing knowledge (upsert)', async () => {
      const content = 'Original content';
      const id1 = await kb.addKnowledge(testTenantId, testCollection, content, { version: 1 });

      // Update with same content but different metadata
      const id2 = await kb.addKnowledge(testTenantId, testCollection, content, { version: 2 });

      // Should return the same ID (upsert, not insert)
      expect(id2).toBe(id1);

      // Verify metadata was updated
      const result = await pool.query('SELECT metadata FROM knowledge WHERE id = $1', [id1]);
      expect(result.rows[0].metadata).toEqual({ version: 2 });
    });
  });

  describe('retrieve', () => {
    beforeEach(async () => {
      // Add test knowledge entries
      const entries = [
        { content: 'Python is a programming language', metadata: { topic: 'python' } },
        { content: 'JavaScript is used for web development', metadata: { topic: 'javascript' } },
        { content: 'TypeScript adds static typing to JavaScript', metadata: { topic: 'typescript' } },
        { content: 'Node.js is a JavaScript runtime', metadata: { topic: 'nodejs' } },
      ];

      for (const entry of entries) {
        await kb.addKnowledge(testTenantId, testCollection, entry.content, entry.metadata);
      }
    });

    it('should retrieve relevant knowledge by similarity', async () => {
      const query = 'What programming language is used for web?';
      const results = await kb.retrieve(testTenantId, testCollection, query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeDefined();
      expect(results[0].similarity).toBeGreaterThan(0);

      // Most relevant result should mention JavaScript or web
      expect(results[0].content).toMatch(/JavaScript|web/);
    });

    it('should respect the limit option', async () => {
      const query = 'programming language';
      const limit = 2;

      const results = await kb.retrieve(testTenantId, testCollection, query, { limit });

      expect(results.length).toBeLessThanOrEqual(limit);
    });

    it('should filter by similarity threshold', async () => {
      const query = 'xyz_invalid_query_123';
      const threshold = 0.9; // High threshold

      const results = await kb.retrieve(testTenantId, testCollection, query, { threshold });

      // Should return few or no results for very different query
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should validate collection names', async () => {
      await expect(
        kb.retrieve(testTenantId, 'invalid collection', 'test query')
      ).rejects.toThrow('Invalid collection name');
    });

    it('should return results in descending similarity order', async () => {
      const query = 'JavaScript programming';

      const results = await kb.retrieve(testTenantId, testCollection, query);

      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].similarity!).toBeGreaterThanOrEqual(results[i + 1].similarity!);
        }
      }
    });
  });

  describe('embedQuery caching', () => {
    it('should cache embeddings', async () => {
      const content = 'Test content for caching';
      const query = 'Test query for caching';

      // First call - cache miss
      const start1 = Date.now();
      await kb['embedQuery'](content);
      const duration1 = Date.now() - start1;

      // Second call - cache hit
      const start2 = Date.now();
      await kb['embedQuery'](content);
      const duration2 = Date.now() - start2;

      // Cached call should be much faster
      expect(duration2).toBeLessThan(duration1);
    });

    it('should return same embedding for same text', async () => {
      const content = 'Consistent content';

      const embedding1 = await kb['embedQuery'](content);
      const embedding2 = await kb['embedQuery'](content);

      expect(embedding1).toEqual(embedding2);
      expect(embedding1.length).toBe(1536);
    });
  });

  describe('content sanitization', () => {
    it('should remove HTML tags', async () => {
      const content = 'Test <script>alert("xss")</script> content';

      const sanitized = kb['sanitizeContent'](content);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should remove SQL injection patterns', async () => {
      const content = 'Test; DROP TABLE users; content';

      const sanitized = kb['sanitizeContent'](content);

      expect(sanitized).not.toContain('; DROP TABLE');
    });

    it('should normalize whitespace', async () => {
      const content = 'Test    content   with    extra    spaces';

      const sanitized = kb['sanitizeContent'](content);

      expect(sanitized).toBe('Test content with extra spaces');
    });

    it('should truncate long content', async () => {
      const longContent = 'a'.repeat(200000); // Exceeds MAX_CONTENT_LENGTH

      const sanitized = kb['sanitizeContent'](longContent);

      expect(sanitized.length).toBe(100000); // MAX_CONTENT_LENGTH
    });

    it('should remove control characters', async () => {
      const content = 'Test\x00\x01\x02\x03content\x04\x05';

      const sanitized = kb['sanitizeContent'](content);

      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x01');
      expect(sanitized).toBe('Testcontent');
    });
  });
});
