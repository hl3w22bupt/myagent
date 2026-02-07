/**
 * Unit tests for PTCGenerator parameter mapping functionality.
 *
 * Tests the findTaskParameter() method to ensure it correctly maps
 * skill names to their appropriate task parameter names.
 *
 * This test file is isolated to avoid database initialization issues.
 */

// Directly import the file path to avoid jest.setup.ts database initialization
import { PTCGenerator } from '../../src/core/agent/ptc-generator';

// Simple mock for LLMClient
class MockLLMClient {
  async messagesCreate() {
    return { content: '' };
  }
}

describe('PTCGenerator Parameter Mapping', () => {
  let ptcGenerator: PTCGenerator;

  beforeEach(() => {
    // Test skills with different parameter names
    const skills = [
      {
        name: 'infographic-generator',
        description: 'Generate infographics',
        tags: ['infographic', 'svg'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Natural language description',
              },
              description: {
                type: 'string',
                description: 'Alias for content',
              },
            },
            required: ['content'],
          },
        },
      },
      {
        name: 'postgres-api-sql-query',
        description: 'Execute SQL queries',
        tags: ['postgres', 'sql'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL query to execute',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        name: 'remotion-generator',
        description: 'Generate videos',
        tags: ['remotion', 'video'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description',
              },
            },
            required: ['description'],
          },
        },
      },
      {
        name: 'web-search',
        description: 'Search the web',
        tags: ['web', 'search'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query string',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        name: 'task-param-skill',
        description: 'Skill with explicit task parameter',
        tags: ['test'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: 'The task to perform',
              },
            },
            required: ['task'],
          },
        },
      },
      {
        name: 'custom-param-skill',
        description: 'Skill with custom parameter name',
        tags: ['test'],
        metadata: {
          input_schema: {
            type: 'object',
            properties: {
              custom_input: {
                type: 'string',
                description: 'Custom input parameter',
              },
            },
            required: ['custom_input'],
          },
        },
      },
      {
        name: 'unknown-skill',
        description: 'Skill without metadata',
        tags: ['test'],
        // No metadata - should fallback to 'task'
      },
    ];

    ptcGenerator = new PTCGenerator(new MockLLMClient() as any, skills);
  });

  describe('findTaskParameter()', () => {
    it('should map to "content" for infographic-generator', () => {
      // Access private method using bracket notation
      const param = (ptcGenerator as any).findTaskParameter('infographic-generator');
      expect(param).toBe('content');
    });

    it('should map to "query" for postgres-api-sql-query', () => {
      const param = (ptcGenerator as any).findTaskParameter('postgres-api-sql-query');
      expect(param).toBe('query');
    });

    it('should map to "description" for remotion-generator', () => {
      const param = (ptcGenerator as any).findTaskParameter('remotion-generator');
      expect(param).toBe('description');
    });

    it('should map to "query" for web-search', () => {
      const param = (ptcGenerator as any).findTaskParameter('web-search');
      expect(param).toBe('query');
    });

    it('should map to "task" when skill has explicit task parameter', () => {
      const param = (ptcGenerator as any).findTaskParameter('task-param-skill');
      expect(param).toBe('task');
    });

    it('should map to first required parameter when no standard params exist', () => {
      const param = (ptcGenerator as any).findTaskParameter('custom-param-skill');
      expect(param).toBe('custom_input');
    });

    it('should fallback to "task" for unknown skills without metadata', () => {
      const param = (ptcGenerator as any).findTaskParameter('unknown-skill');
      expect(param).toBe('task');
    });

    it('should fallback to "task" for non-existent skills', () => {
      const param = (ptcGenerator as any).findTaskParameter('non-existent-skill');
      expect(param).toBe('task');
    });
  });

  describe('Parameter Priority Order', () => {
    it('should prioritize "task" over other parameters', () => {
      const skills = [
        {
          name: 'priority-test',
          description: 'Test parameter priority',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {
                task: { type: 'string' },
                description: { type: 'string' },
                content: { type: 'string' },
                query: { type: 'string' },
              },
              required: ['task', 'description', 'content', 'query'],
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('priority-test');
      expect(param).toBe('task');
    });

    it('should prioritize "description" over "content" and "query"', () => {
      const skills = [
        {
          name: 'priority-test',
          description: 'Test parameter priority',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                content: { type: 'string' },
                query: { type: 'string' },
              },
              required: ['description', 'content', 'query'],
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('priority-test');
      expect(param).toBe('description');
    });

    it('should prioritize "content" over "query"', () => {
      const skills = [
        {
          name: 'priority-test',
          description: 'Test parameter priority',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                query: { type: 'string' },
              },
              required: ['content', 'query'],
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('priority-test');
      expect(param).toBe('content');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input_schema', () => {
      const skills = [
        {
          name: 'empty-schema',
          description: 'Empty schema test',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {},
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('empty-schema');
      expect(param).toBe('task');
    });

    it('should handle schema with no required fields', () => {
      const skills = [
        {
          name: 'no-required',
          description: 'No required fields test',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {
                custom_param: { type: 'string' },
              },
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('no-required');
      expect(param).toBe('task'); // Falls back because no standard params and no required fields
    });

    it('should handle schema with properties but empty required array', () => {
      const skills = [
        {
          name: 'empty-required',
          description: 'Empty required array test',
          tags: ['test'],
          metadata: {
            input_schema: {
              type: 'object',
              properties: {
                custom_param: { type: 'string' },
              },
              required: [],
            },
          },
        },
      ];

      const generator = new PTCGenerator(new MockLLMClient() as any, skills);
      const param = (generator as any).findTaskParameter('empty-required');
      expect(param).toBe('task'); // Falls back because no standard params
    });
  });
});
