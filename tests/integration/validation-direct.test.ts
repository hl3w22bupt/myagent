/**
 * ValidationHook Direct Method Tests
 *
 * Tests ValidationHook.validateOutput() directly without going through Agent.run()
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { getDataStore } from '@/core/database/data-store';

describe('ValidationHook Direct Method Tests', () => {
  beforeAll(async () => {
    const store = getDataStore();
    await store.initialize();
  });

  afterAll(async () => {
    const store = getDataStore();
    await store.close();
  });

  describe('validateOutput() Method', () => {
    const baseConfig = {
      systemPrompt: 'Test agent',
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-5',
      },
      sandbox: {
        type: 'local' as const,
        local: {
          pythonPath: 'python3',
          timeout: 5000,
        },
      },
    };

    it('should pass through output when no validation is configured', async () => {
      const agent = new Agent(baseConfig, 'test-session-1');

      const output = 'Any output';
      const result = await (agent as any).validateOutput(output, 'test-task-1');

      expect(result).toBe(output);
    });

    it('should validate string length in strict mode', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          schema: {
            output: {
              type: 'string',
              minLength: 10,
            },
          },
        },
      }, 'test-session-2');

      const validOutput = { output: 'This is long enough' };
      const result = await (agent as any).validateOutput(validOutput, 'test-task-2');
      expect(result).toEqual(validOutput);
    });

    it('should throw ValidationError in strict mode when validation fails', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          schema: {
            output: {
              type: 'string',
              minLength: 100,
            },
          },
        },
      }, 'test-session-3');

      const shortOutput = { output: 'Too short' };

      await expect(
        (agent as any).validateOutput(shortOutput, 'test-task-3')
      ).rejects.toThrow('Output validation failed');
    });

    it('should sanitize output in fallback mode', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'fallback',
          schema: {
            output: {
              type: 'string',
              minLength: 100,
            },
          },
        },
      }, 'test-session-4');

      const shortOutput = { output: 'Too short' };
      const result = await (agent as any).validateOutput(shortOutput, 'test-task-4');

      // Should return output despite validation failure
      expect(result).toEqual(shortOutput);
    });

    it('should validate pattern matching', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          formats: [
            {
              field: 'output',
              pattern: '^[A-Z]{2}-\\d+$',
              message: 'Must match XX-123 format',
            },
          ],
        },
      }, 'test-session-5');

      const validOutput = { output: 'US-123' };
      const result = await (agent as any).validateOutput(validOutput, 'test-task-5');
      expect(result).toEqual(validOutput);
    });

    it('should fail pattern validation in strict mode', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          formats: [
            {
              field: 'output',
              pattern: '^[A-Z]{2}-\\d+$',
              message: 'Must match XX-123 format',
            },
          ],
        },
      }, 'test-session-6');

      const invalidOutput = { output: 'invalid-format' };

      await expect(
        (agent as any).validateOutput(invalidOutput, 'test-task-6')
      ).rejects.toThrow('Output validation failed');
    });

    it('should validate against schema with multiple rules', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          schema: {
            output: {
              type: 'string',
              minLength: 5,
              maxLength: 20,
            },
          },
          formats: [
            {
              field: 'output',
              pattern: '^[A-Z]{2}-\\d+$',
            },
          ],
        },
      }, 'test-session-7');

      const validOutput = { output: 'US-42' };
      const result = await (agent as any).validateOutput(validOutput, 'test-task-7');
      expect(result).toEqual(validOutput);
    });

    it('should fail when any validator fails in strict mode', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          schema: {
            output: {
              type: 'string',
              minLength: 100,  // This will fail
            },
          },
          formats: [
            {
              field: 'output',
              pattern: '^[A-Z]{2}-\\d+$',  // This would pass
            },
          ],
        },
      }, 'test-session-8');

      const invalidOutput = { output: 'US-42' };  // Matches pattern but too short

      await expect(
        (agent as any).validateOutput(invalidOutput, 'test-task-8')
      ).rejects.toThrow('Output validation failed');
    });

    it('should include detailed error information in ValidationError', async () => {
      const agent = new Agent({
        ...baseConfig,
        validation: {
          strategy: 'strict',
          schema: {
            output: {
              type: 'string',
              minLength: 100,
            },
          },
        },
      }, 'test-session-9');

      const shortOutput = 'Short';

      try {
        await (agent as any).validateOutput(shortOutput, 'test-task-9');
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
