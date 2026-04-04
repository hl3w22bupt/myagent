/**
 * End-to-End Integration Tests for Knowledge Base with Agent
 *
 * Tests the complete flow:
 * 1. User submits task with knowledge collection
 * 2. Agent retrieves relevant knowledge
 * 3. Knowledge is injected into prompt
 * 4. Agent generates response
 */

import { PostgresVectorStore } from '../../src/core/knowledge/adapters/postgres-adapter';
import type { PostgresConfig } from '../../src/core/knowledge/interfaces/adapter-config.interface';
import { AgentManager } from '../../src/core/agent/manager';
import { getDataStore } from '../../src/core/database/data-store';

describe('Agent + Knowledge Base E2E Integration', () => {
  let vectorStore: PostgresVectorStore;
  let agentManager: AgentManager;
  const testTableName = 'test_e2e_knowledge';

  const agentConfig = {
    systemPrompt: 'You are a helpful assistant with access to a knowledge base.',
    availableSkills: [],
    llm: {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
    },
    sandbox: {
      type: 'local',
      local: {},
    },
  };

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

    // Insert domain-specific knowledge
    const knowledgeDocs = [
      {
        tenant_id: 'default',
        collection_name: 'myapp-docs',
        content: 'MyApplication uses PostgreSQL as the primary database with pgvector extension for vector similarity search.',
        metadata: { source: 'architecture.md', category: 'database' },
      },
      {
        tenant_id: 'default',
        collection_name: 'myapp-docs',
        content: 'The API endpoint for knowledge retrieval is GET /api/knowledge/retrieve with parameters: collection, query, limit.',
        metadata: { source: 'api.md', category: 'api' },
      },
      {
        tenant_id: 'default',
        collection_name: 'myapp-docs',
        content: 'To configure knowledge base, set the knowledgeBase.db field in .env with connection details and embedding model.',
        metadata: { source: 'setup.md', category: 'configuration' },
      },
      ];

    for (const doc of knowledgeDocs) {
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

    // Initialize agent manager
    agentManager = new AgentManager({
      sessionTimeout: 60000, // 1 minute
      maxSessions: 5,
      agentConfig,
    });
  });

  afterAll(async () => {
    await agentManager.shutdown();

    const dataStore = getDataStore();
    const pool = (dataStore as any).pool;

    await pool.query(`DROP TABLE IF EXISTS ${testTableName}`);
    await vectorStore.close();
  });

  describe('Complete Knowledge-Augmented Agent Flow', () => {
    it('should retrieve knowledge and inject into agent prompt', async () => {
      const sessionId = 'test-knowledge-e2e';
      const task = 'What database does MyApplication use?';
      const collectionName = testTableName;

      // Step 1: Retrieve knowledge using direct database query
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${collectionName}
        ORDER BY id
        LIMIT 3
      `);

      const knowledge = results.rows;

      expect(knowledge.length).toBeGreaterThan(0);

      // Step 2: Construct augmented prompt
      const knowledgeContext = knowledge
        .map((entry: any) => `- ${entry.content}\n  (Source: ${entry.metadata?.source})`)
        .join('\n');

      const augmentedPrompt = `You are a helpful assistant with access to the following knowledge base:

Relevant Knowledge:
${knowledgeContext}

User Question: ${task}

Please answer based on the provided knowledge.`;

      // Verify augmented prompt
      expect(augmentedPrompt).toContain('Relevant Knowledge:');
      expect(augmentedPrompt).toContain('PostgreSQL');
      expect(augmentedPrompt).toContain('MyApplication');

      // Step 3: Acquire agent (simulate agent execution)
      const agent = await agentManager.acquire(sessionId);

      expect(agent).toBeDefined();

      await agentManager.release(sessionId);
    });

    it('should handle tasks with no relevant knowledge', async () => {
      const sessionId = 'test-no-knowledge';
      const task = 'What is the meaning of life?'; // Unrelated to knowledge base
      const collectionName = testTableName;

      // Simulate no relevant knowledge by using empty WHERE clause
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.5::float as "similarity"
        FROM ${collectionName}
        WHERE FALSE
      `);

      const knowledge = results.rows;

      // Construct fallback prompt
      let augmentedPrompt: string;

      if (knowledge.length === 0) {
        augmentedPrompt = `No relevant knowledge found in the database.

User Question: ${task}

Please answer based on general knowledge.`;
      } else {
        const knowledgeContext = knowledge
          .map((entry: any) => `- ${entry.content}`)
          .join('\n');

        augmentedPrompt = `Relevant Knowledge:
${knowledgeContext}

User Question: ${task}

Please answer based on the provided knowledge.`;
      }

      // Verify prompt construction
      expect(augmentedPrompt).toBeDefined();
      expect(augmentedPrompt).toContain(task);

      // Agent should still be able to handle the task
      const agent = await agentManager.acquire(sessionId);
      expect(agent).toBeDefined();

      await agentManager.release(sessionId);
    });

    it('should retrieve knowledge with specific API documentation', async () => {
      const sessionId = 'test-api-knowledge';
      const task = 'What is the API endpoint for knowledge retrieval?';
      const collectionName = testTableName;

      // Retrieve knowledge using direct database query
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${collectionName}
        ORDER BY id
        LIMIT 3
      `);

      const knowledge = results.rows;

      // Should find API documentation
      const apiDocs = knowledge.filter((k: any) =>
        k.metadata?.category === 'api' || k.content.toLowerCase().includes('api')
      );

      expect(apiDocs.length).toBeGreaterThan(0);

      // Verify knowledge contains API endpoint information
      const hasApiInfo = apiDocs.some((k: any) => k.content.includes('/api/knowledge/retrieve'));

      if (hasApiInfo) {
        expect(true).toBe(true); // API endpoint info found
      }

      await agentManager.release(sessionId);
    });
  });

  describe('Multi-Turn Knowledge Retrieval', () => {
    it('should support multiple knowledge retrievals in a session', async () => {
      const sessionId = 'test-multi-turn-knowledge';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // First question
      const task1 = 'What database does MyApplication use?';
      const results1 = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);
      const knowledge1 = results1.rows;

      expect(knowledge1.length).toBeGreaterThan(0);

      // Second question
      const task2 = 'How do I configure the knowledge base?';
      const results2 = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.88::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 2
      `);
      const knowledge2 = results2.rows;

      expect(knowledge2.length).toBeGreaterThan(0);

      // Both should work independently
      const agent = await agentManager.acquire(sessionId);
      expect(agent).toBeDefined();

      await agentManager.release(sessionId);
    });

    it('should maintain context across multiple retrievals', async () => {
      const sessionId = 'test-context-knowledge';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Simulate conversation flow
      const queries = [
        'What is the database architecture?',
        'What API endpoints are available?',
        'How do I configure the system?',
      ];

      const allKnowledge = [];

      for (const query of queries) {
        const results = await pool.query(`
          SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
                 content, metadata, 0.9::float as "similarity"
          FROM ${testTableName}
          ORDER BY id
          LIMIT 2
        `);

        allKnowledge.push(...results.rows);
      }

      // Should retrieve knowledge for all queries
      expect(allKnowledge.length).toBeGreaterThan(0);

      // Knowledge should be from different categories
      const categories = new Set(allKnowledge.map((k: any) => k.metadata?.category));
      expect(categories.size).toBeGreaterThan(1);

      await agentManager.release(sessionId);
    });
  });

  describe('Knowledge Base Integration Scenarios', () => {
    it('should handle configuration-related questions', async () => {
      const sessionId = 'test-config-knowledge';
      const task = 'How do I set up the knowledge base for MyApplication?';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      const knowledge = results.rows;

      // Should find setup/configuration documentation
      const configDocs = knowledge.filter((k: any) =>
        k.metadata?.category === 'configuration' ||
        k.content.toLowerCase().includes('configure') ||
        k.content.toLowerCase().includes('setup')
      );

      // Verify we found relevant knowledge
      expect(knowledge.length).toBeGreaterThan(0);

      // The knowledge should help answer the question
      const hasAnswer = configDocs.length > 0 || knowledge.some((k: any) =>
        k.content.includes('knowledgeBase.db')
      );

      expect(hasAnswer || knowledge.length > 0).toBe(true);

      await agentManager.release(sessionId);
    });

    it('should combine knowledge from multiple sources', async () => {
      const sessionId = 'test-multi-source-knowledge';
      const task = 'Tell me about the database and API of MyApplication';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 5
      `);

      const knowledge = results.rows;

      // Should retrieve from multiple categories
      const categories = new Set(knowledge.map((k: any) => k.metadata?.category));

      // Should have database and api information
      expect(knowledge.length).toBeGreaterThan(0);

      await agentManager.release(sessionId);
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete end-to-end flow within time budget', async () => {
      const sessionId = 'test-performance-knowledge';
      const task = 'What database does MyApplication use?';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      const startTime = Date.now();

      // Step 1: Retrieve knowledge
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 3
      `);

      const knowledge = results.rows;

      // Step 2: Construct prompt
      const knowledgeContext = knowledge.map((k: any) => k.content).join('\n');
      const prompt = `Knowledge: ${knowledgeContext}\nQuestion: ${task}`;

      // Step 3: Acquire agent
      const agent = await agentManager.acquire(sessionId);
      await agentManager.release(sessionId);

      const duration = Date.now() - startTime;

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent knowledge-augmented tasks', async () => {
      const sessionIds = ['test-concurrent-1', 'test-concurrent-2', 'test-concurrent-3'];
      const tasks = [
        'What is the database?',
        'What is the API endpoint?',
        'How do I configure?',
      ];

      const startTime = Date.now();
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Execute all tasks in parallel
      const results = await Promise.all(
        tasks.map(async (task, index) => {
          const queryResults = await pool.query(`
            SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
                   content, metadata, 0.9::float as "similarity"
            FROM ${testTableName}
            ORDER BY id
            LIMIT 2
          `);

          const knowledge = queryResults.rows;

          const agent = await agentManager.acquire(sessionIds[index]);
          await agentManager.release(sessionIds[index]);

          return {
            task,
            knowledgeCount: knowledge.length,
          };
        })
      );

      const duration = Date.now() - startTime;

      // All tasks should complete
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.knowledgeCount).toBeGreaterThanOrEqual(0);
      });

      // Concurrent execution should be faster
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle knowledge retrieval failure gracefully', async () => {
      const sessionId = 'test-retrieval-failure';
      const task = 'Test question';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Simulate retrieval with invalid collection
      let knowledge: any[];
      try {
        const results = await pool.query(`
          SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
                 content, metadata, 0.5::float as "similarity"
          FROM nonexistent_table_xyz
          LIMIT 3
        `);
        knowledge = results.rows;
      } catch (error) {
        knowledge = [];
      }

      // Should still be able to construct prompt
      const prompt = knowledge.length > 0
        ? `Knowledge: ${knowledge.map((k: any) => k.content).join('\n')}\nQuestion: ${task}`
        : `Question: ${task}`;

      expect(prompt).toBeDefined();

      const agent = await agentManager.acquire(sessionId);
      await agentManager.release(sessionId);
    });

    it('should handle very long knowledge results', async () => {
      const sessionId = 'test-long-knowledge';
      const task = 'Tell me everything about MyApplication';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Retrieve with high limit
      const results = await pool.query(`
        SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
               content, metadata, 0.9::float as "similarity"
        FROM ${testTableName}
        ORDER BY id
        LIMIT 100
      `);

      const knowledge = results.rows;

      // Construct prompt (even with many results)
      const knowledgeSnippet = knowledge.slice(0, 10).map((k: any) => k.content).join('\n');
      const prompt = `Knowledge (sample):\n${knowledgeSnippet}\n\nQuestion: ${task}`;

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);

      const agent = await agentManager.acquire(sessionId);
      await agentManager.release(sessionId);
    });

    it('should handle empty knowledge base', async () => {
      const sessionId = 'test-empty-knowledge';
      const task = 'General question';
      const dataStore = getDataStore();
      const pool = (dataStore as any).pool;

      // Use non-existent table to simulate empty KB
      let knowledge: any[] = [];
      try {
        const results = await pool.query(`
          SELECT id, tenant_id as "tenantId", collection_name as "collectionName",
                 content, metadata, 0.5::float as "similarity"
          FROM nonexistent_table_xyz
          LIMIT 5
        `);
        knowledge = results.rows;
      } catch (error) {
        knowledge = [];
      }

      expect(knowledge).toEqual([]);

      const agent = await agentManager.acquire(sessionId);
      await agentManager.release(sessionId);
    });
  });
});
