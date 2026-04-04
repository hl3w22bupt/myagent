/**
 * Unit tests for RetrievalCoordinator.
 *
 * Test coverage:
 * - Happy Path: Parallel retrieval, score normalization
 * - Error Paths: Timeout, partial failures
 * - Edge Cases: Empty results, single source
 * - Performance: Concurrent requests
 */

import { RetrievalCoordinator } from '../../../src/core/knowledge/coordinator/retrieval-coordinator';
import type { VectorStoreConfig } from '../../../src/core/knowledge/interfaces/adapter-config.interface';
import type { KnowledgeEntry } from '../../../src/core/knowledge/interfaces/vector-store.interface';

// Mock PostgresVectorStore
jest.mock('../../../src/core/knowledge/adapters/postgres-adapter', () => ({
  PostgresVectorStore: jest.fn().mockImplementation(() => ({
    retrieve: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock LanceDB loader
jest.mock('../../../src/core/knowledge/loaders/lancedb-loader', () => ({
  getLanceDBAdapter: jest.fn().mockResolvedValue(
    class MockLanceDBVectorStore {
      retrieve = jest.fn();
      close = jest.fn();
    }
  ),
}));

describe('RetrievalCoordinator', () => {
  let coordinator: RetrievalCoordinator;
  let mockPostgresStore: any;
  let mockLanceDBStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new RetrievalCoordinator({
      maxConcurrency: 5,
      limitPerSource: 10,
      globalLimit: 5,
      normalizationStrategy: 'min-max',
    });

    // Setup mock stores
    const { PostgresVectorStore } = require('../../../src/core/knowledge/adapters/postgres-adapter');
    mockPostgresStore = new PostgresVectorStore();

    // Mock LanceDB adapter
    const { getLanceDBAdapter } = require('../../../src/core/knowledge/loaders/lancedb-loader');
    getLanceDBAdapter.mockResolvedValue(
      class MockLanceDBVectorStore {
        retrieve = jest.fn();
        close = jest.fn();
      }
    );
  });

  afterEach(async () => {
    await coordinator.close();
  });

  describe('retrieve()', () => {
    const postgresConfig: VectorStoreConfig = {
      type: 'postgres-pgvector',
      connection: {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      },
      embedding: {
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
    };

    const lancedbConfig: VectorStoreConfig = {
      type: 'lancedb',
      connection: {
        uri: './test-lancedb',
      },
      embedding: {
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
    };

    it('should retrieve from single source successfully', async () => {
      const mockResults: KnowledgeEntry[] = [
        { content: 'Result 1', similarity: 0.9, metadata: {} },
        { content: 'Result 2', similarity: 0.8, metadata: {} },
      ];

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('Result 1');
      expect(mockPostgresStore.retrieve).toHaveBeenCalledWith(
        'test-collection',
        'test query',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should retrieve from multiple sources in parallel', async () => {
      const postgresResults: KnowledgeEntry[] = [
        { content: 'PG Result 1', similarity: 0.9, metadata: {} },
        { content: 'PG Result 2', similarity: 0.7, metadata: {} },
      ];

      const lancedbResults: KnowledgeEntry[] = [
        { content: 'Lance Result 1', similarity: 0.85, metadata: {} },
        { content: 'Lance Result 2', similarity: 0.75, metadata: {} },
      ];

      // First call gets PostgresVectorStore
      const { PostgresVectorStore } = require('../../../src/core/knowledge/adapters/postgres-adapter');
      const mockStore1 = new PostgresVectorStore();
      mockStore1.retrieve.mockResolvedValue(postgresResults);

      // Second call gets LanceDBVectorStore
      const { getLanceDBAdapter } = require('../../../src/core/knowledge/loaders/lancedb-loader');
      const MockLanceDBAdapter = await getLanceDBAdapter();
      const mockStore2 = new MockLanceDBAdapter();
      mockStore2.retrieve.mockResolvedValue(lancedbResults);

      const results = await coordinator.retrieve(
        [postgresConfig, lancedbConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(results).toHaveLength(4); // Combined results
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'PG Result 1' }),
          expect.objectContaining({ content: 'Lance Result 1' }),
        ])
      );
    });

    it('should normalize similarity scores using min-max strategy', async () => {
      const mockResults: KnowledgeEntry[] = [
        { content: 'Result 1', similarity: 0.5, metadata: {} },
        { content: 'Result 2', similarity: 0.9, metadata: {} },
        { content: 'Result 3', similarity: 0.7, metadata: {} },
      ];

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      // After normalization: (0.5, 0.9, 0.7) -> (0, 1, 0.5)
      const result1 = results.find(r => r.content === 'Result 1');
      const result2 = results.find(r => r.content === 'Result 2');
      const result3 = results.find(r => r.content === 'Result 3');

      expect(result2?.similarity).toBe(1.0); // Max becomes 1
      expect(result1?.similarity).toBe(0.0); // Min becomes 0
      expect(result3?.similarity).toBeCloseTo(0.5, 1); // Mid becomes 0.5
    });

    it('should limit results to globalLimit', async () => {
      const mockResults: KnowledgeEntry[] = Array.from({ length: 20 }, (_, i) => ({
        content: `Result ${i}`,
        similarity: 0.9 - i * 0.01,
        metadata: {},
      }));

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query',
        { limit: 5 }
      );

      expect(results).toHaveLength(5);
    });

    it('should handle partial failures gracefully', async () => {
      const postgresResults: KnowledgeEntry[] = [
        { content: 'PG Result', similarity: 0.9, metadata: {} },
      ];

      const { PostgresVectorStore } = require('../../../src/core/knowledge/adapters/postgres-adapter');
      const mockStore1 = new PostgresVectorStore();
      mockStore1.retrieve.mockResolvedValue(postgresResults);

      const { getLanceDBAdapter } = require('../../../src/core/knowledge/loaders/lancedb-loader');
      const MockLanceDBAdapter = await getLanceDBAdapter();
      const mockStore2 = new MockLanceDBAdapter();
      mockStore2.retrieve.mockRejectedValue(new Error('LanceDB failed'));

      const results = await coordinator.retrieve(
        [postgresConfig, lancedbConfig],
        'default',
        'test-collection',
        'test query'
      );

      // Should return only successful results
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('PG Result');
    });

    it('should return empty array when all sources fail', async () => {
      mockPostgresStore.retrieve.mockRejectedValue(new Error('PostgreSQL failed'));

      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(results).toHaveLength(0);
    });

    it('should handle query timeout', async () => {
      // Mock a slow query that times out
      mockPostgresStore.retrieve.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 15000))
      );

      const startTime = Date.now();
      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );
      const duration = Date.now() - startTime;

      // Should timeout after ~10 seconds
      expect(duration).toBeLessThan(12000);
      expect(results).toHaveLength(0); // Timeout results in empty
    }, 15000);

    it('should not normalize when strategy is "none"', async () => {
      const coordinatorNoNorm = new RetrievalCoordinator({
        normalizationStrategy: 'none',
      });

      const mockResults: KnowledgeEntry[] = [
        { content: 'Result 1', similarity: 0.5, metadata: {} },
        { content: 'Result 2', similarity: 0.9, metadata: {} },
      ];

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinatorNoNorm.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(results[0].similarity).toBe(0.5);
      expect(results[1].similarity).toBe(0.9);

      await coordinatorNoNorm.close();
    });

    it('should handle empty result set', async () => {
      mockPostgresStore.retrieve.mockResolvedValue([]);

      const results = await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(results).toHaveLength(0);
    });

    it('should respect limitPerSource option', async () => {
      const coordinatorWithLimit = new RetrievalCoordinator({
        limitPerSource: 3,
      });

      const mockResults: KnowledgeEntry[] = Array.from({ length: 10 }, (_, i) => ({
        content: `Result ${i}`,
        similarity: 0.9 - i * 0.01,
        metadata: {},
      }));

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      await coordinatorWithLimit.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(mockPostgresStore.retrieve).toHaveBeenCalledWith(
        'test-collection',
        'test query',
        expect.objectContaining({ limit: 3 })
      );

      await coordinatorWithLimit.close();
    });
  });

  describe('close()', () => {
    it('should close all store connections', async () => {
      const postgresConfig: VectorStoreConfig = {
        type: 'postgres-pgvector',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
        embedding: {
          apiKey: 'test-key',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
      };

      // Create a store by retrieving
      mockPostgresStore.retrieve.mockResolvedValue([]);
      await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      // Close coordinator
      await coordinator.close();

      // Verify close was called
      expect(mockPostgresStore.close).toHaveBeenCalled();
    });

    it('should handle closing when no stores are open', async () => {
      await expect(coordinator.close()).resolves.not.toThrow();
    });

    it('should clear stores cache after closing', async () => {
      const postgresConfig: VectorStoreConfig = {
        type: 'postgres-pgvector',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
        embedding: {
          apiKey: 'test-key',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
      };

      mockPostgresStore.retrieve.mockResolvedValue([]);
      await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      await coordinator.close();

      // Retrieve again should create new store
      const { PostgresVectorStore } = require('../../../src/core/knowledge/adapters/postgres-adapter');
      const newInstance = new PostgresVectorStore();

      mockPostgresStore.retrieve.mockResolvedValue([]);
      await coordinator.retrieve(
        [postgresConfig],
        'default',
        'test-collection',
        'test query'
      );

      expect(PostgresVectorStore).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all scores being the same', async () => {
      const coordinatorWithNorm = new RetrievalCoordinator({
        normalizationStrategy: 'min-max',
      });

      const mockResults: KnowledgeEntry[] = [
        { content: 'Result 1', similarity: 0.5, metadata: {} },
        { content: 'Result 2', similarity: 0.5, metadata: {} },
        { content: 'Result 3', similarity: 0.5, metadata: {} },
      ];

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinatorWithNorm.retrieve(
        [{
          type: 'postgres-pgvector',
          connection: {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          },
          embedding: {
            apiKey: 'test-key',
            model: 'text-embedding-3-small',
            dimensions: 1536,
          },
        }],
        'default',
        'test-collection',
        'test query'
      );

      // All scores should remain 0.5 when max === min
      expect(results.every(r => r.similarity === 0.5)).toBe(true);

      await coordinatorWithNorm.close();
    });

    it('should handle results with undefined similarity', async () => {
      const mockResults: KnowledgeEntry[] = [
        { content: 'Result 1', similarity: 0.9, metadata: {} },
        { content: 'Result 2', similarity: undefined, metadata: {} },
        { content: 'Result 3', similarity: 0.7, metadata: {} },
      ];

      mockPostgresStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinator.retrieve(
        [{
          type: 'postgres-pgvector',
          connection: {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
          },
          embedding: {
            apiKey: 'test-key',
            model: 'text-embedding-3-small',
            dimensions: 1536,
          },
        }],
        'default',
        'test-collection',
        'test query'
      );

      // Undefined should be treated as 0
      expect(results).toHaveLength(3);
    });
  });

  describe('Configuration', () => {
    it('should use default config when none provided', () => {
      const defaultCoordinator = new RetrievalCoordinator();

      expect(defaultCoordinator).toBeDefined();

      defaultCoordinator.close();
    });

    it('should handle custom config', () => {
      const customCoordinator = new RetrievalCoordinator({
        maxConcurrency: 10,
        limitPerSource: 20,
        globalLimit: 15,
        normalizationStrategy: 'min-max',
      });

      expect(customCoordinator).toBeDefined();

      customCoordinator.close();
    });
  });
});
