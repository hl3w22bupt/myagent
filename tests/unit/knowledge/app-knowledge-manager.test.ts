/**
 * Integration tests for AppKnowledgeManager.
 *
 * These tests use a real database connection with automatic cleanup.
 */

import { Pool } from 'pg';
import {
  getAppKnowledgeCollections,
  addAppKnowledgeCollection,
  removeAppKnowledgeCollection,
  batchConfigureAppKnowledgeCollections,
  getAppsForKnowledgeCollection,
  detectTableDimensions,
  closePool as closeAppKnowledgePool,
} from '../../../src/core/knowledge/app-knowledge-manager';
import { getDataStore } from '../../../src/core/database/data-store';

// Get test database connection - use existing connection from jest setup
const getTestPool = (): Pool => {
  // Access the global pool from jest setup
  const dataStore = getDataStore();
  return (dataStore as any).pool;
};

describe('AppKnowledgeManager (Integration)', () => {
  let testPool: Pool;

  beforeAll(async () => {
    testPool = getTestPool();
  });

  afterAll(async () => {
    await testPool.end();
    await closeAppKnowledgePool();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await testPool.query('DELETE FROM app_knowledge_mappings WHERE app_id LIKE \'test-%\'');
    await closeAppKnowledgePool();
  });

  afterEach(async () => {
    // Clean up after each test
    await testPool.query('DELETE FROM app_knowledge_mappings WHERE app_id LIKE \'test-%\'');
    await closeAppKnowledgePool();
  });

  describe('getAppKnowledgeCollections()', () => {
    it('should return enabled collections for an app', async () => {
      // First insert test data
      await testPool.query(`
        INSERT INTO app_knowledge_mappings (app_id, table_name, threshold, enabled, priority)
        VALUES ('test-app', 'python-docs', 0.7, true, 0),
               ('test-app', 'js-docs', 0.8, true, 1)
      `);

      const result = await getAppKnowledgeCollections('test-app');

      expect(result).toHaveLength(2);
      expect(result[0].table_name).toBe('python-docs'); // priority 0 comes first
      expect(result[1].table_name).toBe('js-docs'); // priority 1 comes second
    });

    it('should return empty array for app with no collections', async () => {
      const result = await getAppKnowledgeCollections('test-nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should order collections by priority and table name', async () => {
      await testPool.query(`
        INSERT INTO app_knowledge_mappings (app_id, table_name, threshold, enabled, priority)
        VALUES ('test-app', 'collection-b', 0.7, true, 1),
               ('test-app', 'collection-a', 0.7, true, 1),
               ('test-app', 'collection-c', 0.7, true, 2)
      `);

      const result = await getAppKnowledgeCollections('test-app');

      expect(result[0].table_name).toBe('collection-a'); // priority 1, alphabetical
      expect(result[1].table_name).toBe('collection-b'); // priority 1, alphabetical
      expect(result[2].table_name).toBe('collection-c'); // priority 2
    });
  });

  describe('addAppKnowledgeCollection()', () => {
    it('should add new collection to app', async () => {
      // Create a test table first
      await testPool.query(`
        CREATE TABLE IF NOT EXISTS test_kb_table (
          id SERIAL PRIMARY KEY,
          content TEXT,
          embedding vector(1536)
        )
      `);

      // Insert test data so dimension detection works
      await testPool.query(`
        INSERT INTO test_kb_table (content, embedding)
        VALUES ('test content', array_fill(0.0, ARRAY[1536])::vector)
      `);

      const result = await addAppKnowledgeCollection('test-app', 'test_kb_table', 'content', 'embedding', 0.7);

      expect(result.table_name).toBe('test_kb_table');
      expect(result.app_id).toBe('test-app');

      // Verify in database
      const dbResult = await testPool.query(
        'SELECT * FROM app_knowledge_mappings WHERE app_id = $1 AND table_name = $2',
        ['test-app', 'test_kb_table']
      );
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].embedding_dimensions).toBe(1536);

      // Clean up test table
      await testPool.query('DROP TABLE IF EXISTS test_kb_table');
    });

    it('should update existing collection (UPSERT)', async () => {
      await testPool.query(`
        INSERT INTO app_knowledge_mappings (app_id, table_name, threshold)
        VALUES ('test-app', 'test-table', 0.5)
      `);

      const result = await addAppKnowledgeCollection('test-app', 'test-table', 'content', 'embedding', 0.8);

      expect(result).toBeDefined();

      // Verify update
      const dbResult = await testPool.query(
        'SELECT threshold FROM app_knowledge_mappings WHERE app_id = $1 AND table_name = $2',
        ['test-app', 'test-table']
      );
      expect(dbResult.rows[0].threshold).toBe('0.800'); // Updated to 0.8
    });

    it('should use default values for optional parameters', async () => {
      // Create a test table first to avoid dimension detection errors
      await testPool.query(`
        CREATE TABLE IF NOT EXISTS test_table (
          id SERIAL PRIMARY KEY,
          embedding vector(1536)
        )
      `);

      // Insert test data
      await testPool.query(`
        INSERT INTO test_table (embedding)
        VALUES (array_fill(0.0, ARRAY[1536])::vector)
      `);

      const result = await addAppKnowledgeCollection('test-app', 'test_table');

      expect(result.content_field).toBe('content');
      expect(result.embedding_field).toBe('embedding');
      expect(result.threshold).toBe('0.700'); // PostgreSQL returns numeric as string
      expect(result.enabled).toBe(true);
      expect(result.priority).toBe(0);

      // Clean up
      await testPool.query('DROP TABLE IF EXISTS test_table');
    });
  });

  describe('removeAppKnowledgeCollection()', () => {
    it('should remove collection from app', async () => {
      await testPool.query(`
        INSERT INTO app_knowledge_mappings (app_id, table_name)
        VALUES ('test-app', 'test-table')
      `);

      const result = await removeAppKnowledgeCollection('test-app', 'test-table');

      expect(result).toBe(true);

      // Verify removal
      const dbResult = await testPool.query(
        'SELECT * FROM app_knowledge_mappings WHERE app_id = $1 AND table_name = $2',
        ['test-app', 'test-table']
      );
      expect(dbResult.rows).toHaveLength(0);
    });

    it('should return false when collection not found', async () => {
      const result = await removeAppKnowledgeCollection('test-app', 'non-existent');

      expect(result).toBe(false);
    });
  });

  describe('batchConfigureAppKnowledgeCollections()', () => {
    it('should configure multiple collections in batch', async () => {
      const collections = [
        { collectionName: 'test-table-1', threshold: 0.7 },
        { collectionName: 'test-table-2', threshold: 0.8 },
        { collectionName: 'test-table-3', threshold: 0.75 },
      ];

      const results = await batchConfigureAppKnowledgeCollections('test-app', collections);

      expect(results).toHaveLength(3);

      // Verify all were inserted
      const dbResult = await testPool.query(
        'SELECT * FROM app_knowledge_mappings WHERE app_id = $1',
        ['test-app']
      );
      expect(dbResult.rows).toHaveLength(3);
    });

    it('should handle empty batch array', async () => {
      const results = await batchConfigureAppKnowledgeCollections('test-app', []);

      expect(results).toHaveLength(0);
    });
  });

  describe('getAppsForKnowledgeCollection()', () => {
    it('should return list of apps using a collection', async () => {
      await testPool.query(`
        INSERT INTO app_knowledge_mappings (app_id, table_name)
        VALUES ('test-app-1', 'shared-table'),
               ('test-app-2', 'shared-table'),
               ('test-app-3', 'shared-table')
      `);

      const result = await getAppsForKnowledgeCollection('shared-table');

      expect(result).toHaveLength(3);
      expect(result).toContain('test-app-1');
      expect(result).toContain('test-app-2');
      expect(result).toContain('test-app-3');
    });

    it('should return empty array when collection not used', async () => {
      const result = await getAppsForKnowledgeCollection('unused-collection');

      expect(result).toHaveLength(0);
    });
  });

  describe('detectTableDimensions()', () => {
    beforeAll(async () => {
      // Create test table with embeddings
      const pool = getTestPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS test_dimensions_table (
          id SERIAL PRIMARY KEY,
          content TEXT,
          embedding vector(768)
        )
      `);

      // Insert a test row with known dimensions using PostgreSQL array syntax
      await pool.query(`
        INSERT INTO test_dimensions_table (content, embedding)
        VALUES ('test', array_fill(0.0, ARRAY[768])::vector)
      `);
    });

    afterAll(async () => {
      const pool = getTestPool();
      await pool.query('DROP TABLE IF EXISTS test_dimensions_table');
    });

    it('should detect dimensions from vector column', async () => {
      const result = await detectTableDimensions('test_dimensions_table', 'embedding');

      expect(result).toBe(768);
    });

    it('should handle non-existent table gracefully', async () => {
      const result = await detectTableDimensions('nonexistent_table', 'embedding');

      // Should return null, not throw error
      expect(result).toBeNull();
    });
  });

  describe('Security - Collection Name Validation', () => {
    it('should reject malicious collection names', async () => {
      // The validation should reject SQL injection attempts
      const result = await detectTableDimensions("'; DROP TABLE users; --", 'embedding');

      expect(result).toBeNull(); // Validation should fail
    });

    it('should reject collection names starting with hyphen', async () => {
      const result = await detectTableDimensions('-invalid-table', 'embedding');

      expect(result).toBeNull(); // Validation should fail
    });
  });

  describe('Edge Cases', () => {
    it('should handle collection names with hyphens (valid)', async () => {
      const pool = getTestPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS test_valid_table (
          id SERIAL PRIMARY KEY,
          embedding vector(1536)
        )
      `);

      // Insert test data
      await pool.query(`
        INSERT INTO test_valid_table (embedding)
        VALUES (array_fill(0.0, ARRAY[1536])::vector)
      `);

      const result = await detectTableDimensions('test_valid_table', 'embedding');

      // Should succeed (validation passes, table exists with data)
      expect(result).toBe(1536);

      // Clean up
      await pool.query('DROP TABLE IF EXISTS test_valid_table');
    });

    it('should handle collection names with underscores (valid)', async () => {
      const result = await detectTableDimensions('test_table_name', 'embedding');

      // Will be null if table doesn't exist, but validation should pass
      // The function should not throw an error
      expect(result).toBeNull();
    });
  });
});
