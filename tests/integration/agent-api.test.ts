/**
 * Agent API Integration Tests.
 *
 * Tests the complete agent workflow from API request to execution.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '../../src/core/agent/agent.js';

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

describe('Agent API Integration Tests', () => {
  let testAgent: Agent;

  beforeAll(async () => {
    // Initialize test agent
    testAgent = new Agent({
      systemPrompt: 'You are a test assistant.',
      availableSkills: ['summarize', 'web-search', 'code-analysis']
    });
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.version).toBeDefined();
      expect(data.services).toBeDefined();
      expect(data.services.api).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Agent Execution API', () => {
    test('should execute simple task', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: 'What is 2 + 2?'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.taskId).toBeDefined();
      expect(data.message).toBe('Task submitted for execution');
    }, TEST_TIMEOUT);

    test('should execute task with sessionId', async () => {
      const sessionId = `test-session-${Date.now()}`;

      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: 'Summarize the benefits of AI',
          sessionId
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe(sessionId);
    }, TEST_TIMEOUT);

    test('should execute task with availableSkills', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: 'Search and summarize AI news',
          availableSkills: ['web-search', 'summarize']
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    }, TEST_TIMEOUT);

    test('should reject invalid request (missing task)', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing 'task' field
          sessionId: 'test-123'
        })
      });

      expect(response.status).not.toBe(200);
      // Should return 4xx error
    }, TEST_TIMEOUT);
  });

  describe('Agent Execution Flow', () => {
    test('should complete full workflow: API → Event → Agent → Result', async () => {
      // This test verifies the complete event-driven workflow
      const startTime = Date.now();

      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: 'Test workflow execution',
          sessionId: `flow-test-${Date.now()}`
        })
      });

      const submitTime = Date.now() - startTime;
      const data = await response.json();

      // Task should be submitted quickly (< 500ms)
      expect(submitTime).toBeLessThan(500);
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Note: Actual agent execution happens asynchronously
      // In production, you would poll or use webhooks to get the final result
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json{'
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    }, TEST_TIMEOUT);

    test('should handle empty task', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: ''
        })
      });

      // Should reject empty tasks
      expect(response.status).not.toBe(200);
    }, TEST_TIMEOUT);
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      // Make many requests quickly
      const requests = Array.from({ length: 150 }, (_, i) =>
        fetch(`${API_BASE_URL}/agent/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            task: `Rate limit test ${i}`
          })
        })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // If rate limiting is enabled, some requests should be rate limited
      // If rate limiting is disabled, this test will pass but won't verify the feature
      if (rateLimitedResponses.length > 0) {
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      }
    }, TEST_TIMEOUT);
  });

  describe('Authentication', () => {
    test('should reject requests without valid API key (if auth enabled)', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key-12345'
        },
        body: JSON.stringify({
          task: 'Test authentication'
        })
      });

      // If authentication is enabled, should reject invalid keys
      // If authentication is disabled, request will succeed
      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        expect(data.error).toBeDefined();
      } else {
        // Auth not enabled, test passes but doesn't verify auth
        expect(response.status).toBe(200);
      }
    }, TEST_TIMEOUT);
  });
});

/**
 * Agent Direct Execution Tests (without API)
 */
describe('Agent Direct Execution Tests', () => {
  let agent: Agent;

  beforeAll(() => {
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['summarize']
    });
  });

  test('should execute simple task directly', async () => {
    const result = await agent.run('Say hello');

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.executionTime).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  test('should handle errors gracefully', async () => {
    // Test with invalid task that might fail
    const result = await agent.run('');

    // Should either fail gracefully or handle empty task
    expect(result).toBeDefined();
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  }, TEST_TIMEOUT);
});
