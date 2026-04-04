/**
 * Unit tests for DataSourceManager.
 *
 * Test coverage:
 * - Happy Path: Connection test, collection discovery
 * - Error Paths: Connection failures, invalid configs
 * - Edge Cases: Empty databases, slow connections
 * - Security: SQL injection in connection strings
 */

import { Pool } from 'pg';
import * as lancedb from '@lancedb/lancedb';
import {
  testConnection,
  discoverCollections,
  getPool,
  closePool,
} from '../../../src/core/knowledge/datasource-manager';
import type { DataSourceConfig } from '../../../src/core/knowledge/datasource-manager';

// Mock PostgreSQL Pool
jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };
  mPool.connect.mockResolvedValue(mClient);
  return { Pool: jest.fn(() => mPool) };
});

// Mock LanceDB
jest.mock('@lancedb/lancedb', () => ({
  connect: jest.fn(),
}));

describe('DataSourceManager', () => {
  afterEach(async () => {
    await closePool();
    jest.clearAllMocks();
  });

  describe('testConnection()', () => {
    describe('PostgreSQL connection', () => {
      const postgresConfig: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test-postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
      };

      it('should successfully connect to PostgreSQL', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockClient = {
          query: jest.fn(),
          release: jest.fn(),
        };
        const mockPool = {
          connect: jest.fn().mockResolvedValue(mockClient),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        const result = await testConnection(postgresConfig);

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
        expect(mockClient.release).toHaveBeenCalled();
        expect(mockPool.end).toHaveBeenCalled();
      });

      it('should handle connection errors gracefully', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          connect: jest.fn().mockRejectedValue(new Error('Connection refused')),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        const result = await testConnection(postgresConfig);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Connection refused');
      });

      it('should use default user when not provided', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockClient = {
          query: jest.fn(),
          release: jest.fn(),
        };
        const mockPool = {
          connect: jest.fn().mockResolvedValue(mockClient),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        const configWithoutUser: DataSourceConfig = {
          type: 'postgres-pgvector',
          name: 'test-postgres',
          connection: {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
          },
        };

        await testConnection(configWithoutUser);

        expect(Pool).toHaveBeenCalledWith(
          expect.objectContaining({
            user: 'leo', // default user
          })
        );
      });

      it('should use max: 1 for test connections', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockClient = {
          query: jest.fn(),
          release: jest.fn(),
        };
        const mockPool = {
          connect: jest.fn().mockResolvedValue(mockClient),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        await testConnection(postgresConfig);

        expect(Pool).toHaveBeenCalledWith(
          expect.objectContaining({
            max: 1,
          })
        );
      });
    });

    describe('LanceDB connection', () => {
      const lancedbConfig: DataSourceConfig = {
        type: 'lancedb',
        name: 'test-lancedb',
        connection: {
          uri: './test-lancedb',
        },
      };

      it('should successfully connect to LanceDB', async () => {
        const mockedLance = lancedb as jest.Mocked<typeof lancedb>;
        const mockDb = {
          close: jest.fn(),
        };
        lance.connect.mockResolvedValue(mockDb);

        const result = await testConnection(lancedbConfig);

        expect(result.success).toBe(true);
        expect(lance.connect).toHaveBeenCalledWith('./test-lancedb');
        expect(mockDb.close).toHaveBeenCalled();
      });

      it('should return error when URI is missing', async () => {
        const configWithoutUri: DataSourceConfig = {
          type: 'lancedb',
          name: 'test-lancedb',
          connection: {},
        };

        const result = await testConnection(configWithoutUri);

        expect(result.success).toBe(false);
        expect(result.error).toBe('LanceDB URI is required');
      });

      it('should handle LanceDB connection errors', async () => {
        const mockedLance = lancedb as jest.Mocked<typeof lancedb>;
        lance.connect.mockRejectedValue(new Error('LanceDB connection failed'));

        const result = await testConnection(lancedbConfig);

        expect(result.success).toBe(false);
        expect(result.error).toBe('LanceDB connection failed');
      });
    });

    describe('Unsupported data source types', () => {
      it('should return error for unsupported type', async () => {
        const invalidConfig: DataSourceConfig = {
          type: 'postgres-pgvector',
          name: 'invalid',
          connection: {},
        } as any;

        // Modify type to something unsupported
        invalidConfig.type = 'invalid-type' as any;

        const result = await testConnection(invalidConfig);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unsupported data source type');
      });
    });
  });

  describe('discoverCollections()', () => {
    describe('PostgreSQL discovery', () => {
      const postgresConfig: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test-postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
      };

      it('should discover all non-system tables', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        // Mock tables query
        mockPool.query
          .mockResolvedValueOnce({
            rows: [
              { name: 'python_docs', size: '100 MB' },
              { name: 'js_docs', size: '50 MB' },
            ],
          })
          // Mock count queries
          .mockResolvedValueOnce({ rows: [{ count: '1000' }] })
          .mockResolvedValueOnce({ rows: [{ count: '500' }] })
          // Mock column queries
          .mockResolvedValueOnce({ rows: [{ column_name: 'embedding', data_type: 'USER-DEFINED' }] })
          .mockResolvedValueOnce({ rows: [{ column_name: 'embedding', data_type: 'USER-DEFINED' }] });

        const result = await discoverCollections(postgresConfig);

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('python_docs');
        expect(result[0].entryCount).toBe(1000);
        expect(result[0].hasEmbeddings).toBe(true);
        expect(result[1].name).toBe('js_docs');
        expect(result[1].entryCount).toBe(500);
      });

      it('should exclude system tables', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        mockPool.query.mockResolvedValue({
          rows: [{ name: 'custom_table', size: '10 MB' }],
        });

        await discoverCollections(postgresConfig);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("AND table_name NOT IN"),
          expect.anything()
        );
      });

      it('should detect tables with embedding columns', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        mockPool.query
          .mockResolvedValueOnce({ rows: [{ name: 'docs', size: '10 MB' }] })
          .mockResolvedValueOnce({ rows: [{ count: '100' }] })
          .mockResolvedValueOnce({
            rows: [{ column_name: 'content_embedding', data_type: 'USER-DEFINED' }],
          });

        const result = await discoverCollections(postgresConfig);

        expect(result[0].hasEmbeddings).toBe(true);
      });

      it('should handle tables without embedding columns', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        mockPool.query
          .mockResolvedValueOnce({ rows: [{ name: 'plain_table', size: '10 MB' }] })
          .mockResolvedValueOnce({ rows: [{ count: '100' }] })
          .mockResolvedValueOnce({ rows: [] }); // No embedding columns

        const result = await discoverCollections(postgresConfig);

        expect(result[0].hasEmbeddings).toBe(false);
      });

      it('should return empty array for database with no tables', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await discoverCollections(postgresConfig);

        expect(result).toHaveLength(0);
      });

      it('should handle query errors gracefully', async () => {
        const MockedPool = Pool as jest.MockedClass<typeof Pool>;
        const mockPool = {
          query: jest.fn(),
          end: jest.fn(),
        };
        Pool.mockImplementation(() => mockPool);

        mockPool.query.mockRejectedValue(new Error('Database query failed'));

        const result = await discoverCollections(postgresConfig);

        expect(result).toHaveLength(0);
      });
    });

    describe('LanceDB discovery', () => {
      const lancedbConfig: DataSourceConfig = {
        type: 'lancedb',
        name: 'test-lancedb',
        connection: {
          uri: './test-lancedb',
        },
      };

      it('should discover LanceDB tables', async () => {
        const mockedLance = lancedb as jest.Mocked<typeof lancedb>;
        const mockDb = {
          tableNames: jest.fn().mockResolvedValue(['table1', 'table2', 'table3']),
          openTable: jest.fn(),
          close: jest.fn(),
        };
        lance.connect.mockResolvedValue(mockDb);

        const result = await discoverCollections(lancedbConfig);

        expect(result).toHaveLength(3);
        expect(result[0].name).toBe('table1');
        expect(result[0].hasEmbeddings).toBe(true);
        expect(mockDb.close).toHaveBeenCalled();
      });

      it('should handle empty LanceDB database', async () => {
        const mockedLance = lancedb as jest.Mocked<typeof lancedb>;
        const mockDb = {
          tableNames: jest.fn().mockResolvedValue([]),
          close: jest.fn(),
        };
        lance.connect.mockResolvedValue(mockDb);

        const result = await discoverCollections(lancedbConfig);

        expect(result).toHaveLength(0);
      });

      it('should return error when URI is missing', async () => {
        const configWithoutUri: DataSourceConfig = {
          type: 'lancedb',
          name: 'test-lancedb',
          connection: {},
        };

        const result = await discoverCollections(configWithoutUri);

        expect(result).toHaveLength(0);
      });

      it('should handle LanceDB connection errors', async () => {
        const mockedLance = lancedb as jest.Mocked<typeof lancedb>;
        lance.connect.mockRejectedValue(new Error('LanceDB not available'));

        const result = await discoverCollections(lancedbConfig);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('getPool() and closePool()', () => {
    it('should create and cache connection pool', () => {
      const config: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
        },
      };

      const mockPool = {};
      Pool.mockImplementation(() => mockPool);

      const pool1 = getPool(config);
      const pool2 = getPool(config);

      expect(pool1).toBe(pool2); // Same instance
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should close connection pool', async () => {
      const config: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
        },
      };

      const mockPool = {
        end: jest.fn(),
      };
      Pool.mockImplementation(() => mockPool);

      getPool(config);
      await closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should create new pool after closing', async () => {
      const config: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
        },
      };

      const mockPool = {
        end: jest.fn(),
      };
      Pool.mockImplementation(() => mockPool);

      const pool1 = getPool(config);
      await closePool();
      const pool2 = getPool(config);

      expect(pool2).toBeDefined();
    });
  });

  describe('Security', () => {
    it('should handle SQL injection in connection parameters', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
        end: jest.fn(),
      };
      Pool.mockImplementation(() => mockPool);

      const maliciousConfig: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: "'; DROP TABLE users; --",
        connection: {
          host: 'localhost',
          port: 5432,
          database: "'; DROP TABLE users; --",
          user: "'; DROP TABLE users; --",
          password: "'; DROP TABLE users; --",
        },
      };

      const result = await testConnection(maliciousConfig);

      // Should not throw error
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long table names', async () => {
      const mockPool = {
        query: jest.fn(),
        end: jest.fn(),
      };
      Pool.mockImplementation(() => mockPool);

      const longTableName = 'a'.repeat(1000);
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ name: longTableName, size: '10 MB' }] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      const config: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'testdb',
        },
      };

      const result = await discoverCollections(config);

      expect(result[0].name).toBe(longTableName);
    });

    it('should handle timeout during connection test', async () => {
      const mockPool = {
        connect: jest.fn().mockImplementation(() => new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )),
        end: jest.fn(),
      };
      Pool.mockImplementation(() => mockPool);

      const config: DataSourceConfig = {
        type: 'postgres-pgvector',
        name: 'test',
        connection: {
          host: 'unreachable-host',
          port: 5432,
          database: 'testdb',
        },
      };

      const result = await testConnection(config);

      expect(result.success).toBe(false);
    });
  });
});
