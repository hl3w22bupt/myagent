/**
 * ValidationHook Integration Tests
 *
 * Tests ValidationHook in real Agent execution scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { AgentManager } from '@/core/agent/manager';
import { getDataStore } from '@/core/database/data-store';

describe('ValidationHook Integration Tests', () => {
  let agentManager: AgentManager;
  const sessionId = 'validation-test-session';

  beforeAll(async () => {
    const store = getDataStore();
    await store.initialize();

    // Create AgentManager with empty skills to use direct LLM response
    agentManager = new AgentManager({
      sessionTimeout: 1800000,
      maxSessions: 100,
      agentConfig: {
        systemPrompt: 'You are a test agent',
        availableSkills: [],  // Empty skills array to use direct LLM response
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          type: 'local',
          local: {
            pythonPath: 'python3',
            timeout: 5000,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await agentManager.shutdown();
    const store = getDataStore();
    await store.close();
  });

  beforeEach(async () => {
    // Release session before each test to ensure clean state
    try {
      await agentManager.release(sessionId);
    } catch {
      // Session might not exist, ignore
    }
  });

  describe('String Schema Validation', () => {
    it('should validate string output against schema in strict mode', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config to agent
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 10,
          },
        },
      };

      // Mock LLM response
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'This is a valid output with enough length',
      });

      const result = await agent.run('Test task', 'test-task-1');

      expect(result.success).toBe(true);
      expect(result.output).toBe('This is a valid output with enough length');
    });

    it('should fail validation when string output is too short in strict mode', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with minimum length requirement
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 100,  // Require at least 100 characters
          },
        },
      };

      // Mock LLM response that's too short
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'Short',
      });

      const result = await agent.run('Test task', 'test-task-2');

      // Agent should return a failure result, not throw
      expect(result.success).toBe(false);
      expect(result.error).toContain('Output validation failed');
    });

    it('should sanitize output in fallback mode', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with fallback strategy
      (agent as any).config.validation = {
        strategy: 'fallback' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 100,
          },
        },
      };

      // Mock LLM response that's too short
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'Short',
      });

      const result = await agent.run('Test task', 'test-task-3');

      // Fallback mode should not throw, but return sanitized output
      expect(result.success).toBe(true);
      expect(result.output).toBe('Short');
    });
  });

  describe('Pattern Validation', () => {
    it('should validate string output against regex pattern', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with pattern
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        formats: [
          {
            field: 'output',
            pattern: '^[A-Z]{2}-\\d+$',
            message: 'Output must match format: XX-123',
          },
        ],
      };

      // Mock LLM response with valid pattern
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'US-123',
      });

      const result = await agent.run('Generate ID', 'test-task-4');

      expect(result.success).toBe(true);
      expect(result.output).toBe('US-123');
    });

    it('should fail validation when pattern does not match', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with pattern
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        formats: [
          {
            field: 'output',
            pattern: '^[A-Z]{2}-\\d+$',
            message: 'Output must match format: XX-123',
          },
        ],
      };

      // Mock LLM response with invalid pattern
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'invalid-format',
      });

      await expect(
        agent.run('Generate ID', 'test-task-5')
      ).rejects.toThrow('Output validation failed');
    });

    it('should skip validation when field is missing in output', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config for a field that doesn't exist
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        formats: [
          {
            field: 'nonExistentField',
            pattern: '^[A-Z]{2}-\\d+$',
            message: 'This should be skipped',
          },
        ],
      };

      // Mock LLM response
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'Any output is fine',
      });

      const result = await agent.run('Test task', 'test-task-6');

      // Should pass because field doesn't exist
      expect(result.success).toBe(true);
    });
  });

  describe('Combined Validation', () => {
    it('should run schema and format validators together', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add comprehensive validation config
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 5,
            maxLength: 50,
          },
        },
        formats: [
          {
            field: 'output',
            pattern: '^[A-Z]{2}-\\d+$',
          },
        ],
      };

      // Mock LLM response passing all validations
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'US-42',
      });

      const result = await agent.run('Generate ID', 'test-task-7');

      expect(result.success).toBe(true);
      expect(result.output).toBe('US-42');
    });

    it('should fail when both schema and format validators fail', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with multiple rules
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 50,  // Too long requirement
          },
        },
        formats: [
          {
            field: 'output',
            pattern: '^[A-Z]{2}-\\d+$',
          },
        ],
      };

      // Mock LLM response failing both validations
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'short',
      });

      await expect(
        agent.run('Generate ID', 'test-task-8')
      ).rejects.toThrow('Output validation failed');
    });

    it('should use fallback mode with multiple validation failures', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config with multiple rules in fallback mode
      (agent as any).config.validation = {
        strategy: 'fallback' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 50,
          },
        },
        formats: [
          {
            field: 'output',
            pattern: '^[A-Z]{2}-\\d+$',
          },
        ],
      };

      // Mock LLM response failing both validations
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'short and wrong format',
      });

      const result = await agent.run('Generate ID', 'test-task-9');

      // In fallback mode, should return output despite validation failures
      expect(result.success).toBe(true);
      expect(result.output).toBe('short and wrong format');
    });
  });

  describe('No Validation Configured', () => {
    it('should pass through output when no validation is configured', async () => {
      // Create a new AgentManager with no validation config
      const cleanAgentManager = new AgentManager({
        sessionTimeout: 1800000,
        maxSessions: 100,
        agentConfig: {
          systemPrompt: 'You are a test agent',
          availableSkills: [],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
          sandbox: {
            type: 'local',
            local: {
              pythonPath: 'python3',
              timeout: 5000,
            },
          },
        },
      });

      const agent = await cleanAgentManager.acquire(sessionId + '-clean');

      // No validation config should be present
      expect((agent as any).config.validation).toBeUndefined();

      // Mock LLM response
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'Any output is valid',
      });

      const result = await agent.run('Test task', 'test-task-10');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Any output is valid');

      await cleanAgentManager.shutdown();
    });
  });

  describe('ValidationError Behavior', () => {
    it('should include detailed error information', async () => {
      const agent = await agentManager.acquire(sessionId);

      // Add validation config
      (agent as any).config.validation = {
        strategy: 'strict' as const,
        schema: {
          output: {
            type: 'string',
            minLength: 100,
          },
        },
      };

      // Mock LLM response
      (agent as any).llm.messagesCreate = jest.fn().mockResolvedValue({
        content: 'Too short',
      });

      try {
        await agent.run('Test task', 'test-task-11');
        fail('Should have thrown ValidationError');
      } catch (error: any) {
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.errors).toBeDefined();
        expect(error.errors.length).toBeGreaterThan(0);
        expect(error.message).toContain('Output validation failed');
      }
    });
  });
});
