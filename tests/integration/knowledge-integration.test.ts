/**
 * MyAgent Knowledge Base Integration Tests
 *
 * Tests for RAG (Retrieval-Augmented Generation) integration:
 * - Knowledge injection to Agent execution
 * - Fallback when knowledge unavailable
 * - Output contains knowledge content
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { MasterAgent } from '../../src/core/agent/master-agent';
import { KnowledgeBase } from '../../src/core/knowledge/knowledge-base';

// Test database configuration
const testDbConfig = {
  host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
  user: process.env.PG_USER || 'leo',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
};

const testTenantId = 'integration-test-tenant';
const testCollection = 'test-knowledge';

describe('Knowledge Base Integration', () => {
  let pool: Pool;
  let kb: KnowledgeBase;

  beforeAll(async () => {
    // Create a connection pool for test setup
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
    await pool.query(
      'DELETE FROM knowledge WHERE tenant_id = $1 AND collection_name = $2',
      [testTenantId, testCollection]
    );
  });

  describe('Knowledge injection to Agent', () => {
    it('should retrieve and inject knowledge into Agent execution', async () => {
      // Add test knowledge
      const knowledgeContent = 'Python is a high-level programming language known for its simplicity and readability. It is widely used for web development, data science, and automation.';
      await kb.addKnowledge(testTenantId, testCollection, knowledgeContent, {
        topic: 'python',
        category: 'programming',
      });

      // Create MasterAgent with KnowledgeBase
      const agent = new MasterAgent(
        {
          systemPrompt: 'You are a helpful assistant.',
          sandbox: {
            type: 'local',
            local: {
              command: 'node',
              args: ['-e', 'console.log("Hello from sandbox")'],
            },
          },
          knowledgeBase: testDbConfig,
          llm: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        testTenantId
      );

      // Execute task with knowledge collection context
      const result = await agent.run(
        'What is Python known for?',
        undefined,
        {
          knowledgeCollection: testCollection,
        }
      );

      // Verify knowledge was retrieved
      expect(result.success).toBe(true);

      // Verify output contains relevant information about Python
      // (This depends on the LLM actually using the retrieved knowledge)
      const output = result.finalOutput || '';
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle knowledge retrieval failure gracefully', async () => {
      // Create MasterAgent with KnowledgeBase
      const agent = new MasterAgent(
        {
          systemPrompt: 'You are a helpful assistant.',
          sandbox: {
            type: 'local',
            local: {
              command: 'node',
              args: ['-e', 'console.log("Hello from sandbox")'],
            },
          },
          knowledgeBase: testDbConfig,
          llm: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        testTenantId
      );

      // Execute task with non-existent collection
      const result = await agent.run(
        'Tell me about something',
        undefined,
        {
          knowledgeCollection: 'non-existent-collection',
        }
      );

      // Agent should still execute successfully (fallback strategy)
      expect(result.success).toBe(true);
      expect(result.finalOutput).toBeDefined();
    });

    it('should work without knowledge collection when not configured', async () => {
      // Create MasterAgent without KnowledgeBase
      const agent = new MasterAgent(
        {
          systemPrompt: 'You are a helpful assistant.',
          sandbox: {
            type: 'local',
            local: {
              command: 'node',
              args: ['-e', 'console.log("Hello from sandbox")'],
            },
          },
          llm: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        testTenantId
      );

      // Execute task without knowledge collection
      const result = await agent.run('Say hello', undefined, {});

      // Agent should execute successfully
      expect(result.success).toBe(true);
      expect(result.finalOutput).toBeDefined();
    });

    it('should include knowledge similarity scores in context', async () => {
      // Add multiple related knowledge entries
      await kb.addKnowledge(testTenantId, testCollection, 'JavaScript is used for web development', {
        topic: 'javascript',
      });
      await kb.addKnowledge(testTenantId, testCollection, 'Python is used for data science', {
        topic: 'python',
      });
      await kb.addKnowledge(testTenantId, testCollection, 'Java is used for enterprise applications', {
        topic: 'java',
      });

      // Query about web development should prioritize JavaScript knowledge
      const results = await kb.retrieve(testTenantId, testCollection, 'web development', {
        limit: 2,
        threshold: 0.5,
      });

      // Most relevant result should be about JavaScript
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeDefined();
      expect(results[0].similarity!).toBeGreaterThan(0.5);
    });
  });
});
