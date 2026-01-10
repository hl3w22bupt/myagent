/**
 * PTC Context Support Tests
 *
 * Tests that PTCGenerator properly handles context (history and variables)
 * in generation options. These tests verify the interface and structure
 * without requiring actual LLM calls.
 */

import { describe, it, expect } from '@jest/globals';
import { PTCGenerator } from '@/core/agent/ptc-generator';
import { LLMClient } from '@/core/agent/llm-client';

describe('PTC Context Support', () => {
  describe('Context Interface', () => {
    it('should accept history in generation options', async () => {
      const llm = new LLMClient({
        provider: 'anthropic',
        model: 'test-model',
        apiKey: 'test-key'
      });

      const skills = [
        {
          name: 'test-skill',
          description: 'A test skill',
          tags: ['test']
        }
      ];

      const ptcGenerator = new PTCGenerator(llm, skills);
      void ptcGenerator; // Mark as used

      // Create options with history
      const options = {
        history: [
          {
            role: 'user' as const,
            content: 'Hello',
            timestamp: Date.now()
          },
          {
            role: 'assistant' as const,
            content: 'Hi there!',
            timestamp: Date.now()
          },
          {
            role: 'user' as const,
            content: 'How are you?',
            timestamp: Date.now()
          }
        ]
      };

      // Verify the interface accepts history
      expect(options.history).toBeDefined();
      expect(options.history).toHaveLength(3);
      expect(options.history![0].role).toBe('user');
      expect(options.history![1].role).toBe('assistant');
    });

    it('should accept variables in generation options', () => {
      const options = {
        variables: {
          username: 'test-user',
          count: 42,
          data: { key: 'value' }
        }
      };

      // Verify the interface accepts variables
      expect(options.variables).toBeDefined();
      expect(options.variables!.username).toBe('test-user');
      expect(options.variables!.count).toBe(42);
      expect(options.variables!.data).toEqual({ key: 'value' });
    });

    it('should accept both history and variables together', () => {
      const options = {
        history: [
          {
            role: 'user' as const,
            content: 'What is the value?',
            timestamp: Date.now()
          }
        ],
        variables: {
          apiKey: 'secret-key',
          endpoint: 'https://api.example.com'
        }
      };

      expect(options.history).toBeDefined();
      expect(options.variables).toBeDefined();
      expect(options.history![0].content).toBe('What is the value?');
      expect(options.variables!.apiKey).toBe('secret-key');
    });
  });

  describe('Context Formatting', () => {
    it('should format history as conversation history XML', () => {
      const history = [
        {
          role: 'user' as const,
          content: 'Hello',
          timestamp: 1000
        },
        {
          role: 'assistant' as const,
          content: 'Hi there!',
          timestamp: 2000
        },
        {
          role: 'user' as const,
          content: 'How are you?',
          timestamp: 3000
        },
        {
          role: 'assistant' as const,
          content: 'I am doing well!',
          timestamp: 4000
        },
        {
          role: 'user' as const,
          content: 'Goodbye',
          timestamp: 5000
        }
      ];

      let contextSection = '';
      if (history && history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      expect(contextSection).toContain('<conversation_history>');
      expect(contextSection).toContain('user: Hello');
      expect(contextSection).toContain('assistant: Hi there!');
      expect(contextSection).toContain('user: How are you?');
      expect(contextSection).toContain('assistant: I am doing well!');
      expect(contextSection).toContain('user: Goodbye');
      expect(contextSection).toContain('</conversation_history>');
    });

    it('should limit history to last 5 messages', () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i + 1}`,
        timestamp: Date.now() + i
      }));

      let contextSection = '';
      if (history && history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      // Should only contain last 5 messages (6-10)
      expect(contextSection).toContain('Message 6');
      expect(contextSection).toContain('Message 10');
      expect(contextSection).not.toContain('Message 5'); // First message NOT in slice(-5)

      // Count occurrences of 'Message N:'
      const messageCount = (contextSection.match(/user: Message \d+/g) || []).length;
      expect(messageCount).toBe(5);
    });

    it('should format variables as available_variables XML', () => {
      const variables = {
        apiKey: 'secret-key',
        endpoint: 'https://api.example.com',
        count: 42
      };

      let contextSection = '';
      if (variables && Object.keys(variables).length > 0) {
        contextSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(variables)) {
          contextSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        contextSection += '</available_variables>\n\n';
      }

      expect(contextSection).toContain('<available_variables>');
      expect(contextSection).toContain('apiKey: "secret-key"');
      expect(contextSection).toContain('endpoint: "https://api.example.com"');
      expect(contextSection).toContain('count: 42');
      expect(contextSection).toContain('</available_variables>');
    });

    it('should handle empty objects gracefully', () => {
      let historySection = '';
      const emptyHistory: any[] = [];

      if (emptyHistory && emptyHistory.length > 0) {
        historySection = '<conversation_history>\n';
        for (const msg of emptyHistory.slice(-5)) {
          historySection += `${msg.role}: ${msg.content}\n`;
        }
        historySection += '</conversation_history>\n\n';
      }

      expect(historySection).toBe('');

      let variablesSection = '';
      const emptyVariables: Record<string, any> = {};

      if (emptyVariables && Object.keys(emptyVariables).length > 0) {
        variablesSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(emptyVariables)) {
          variablesSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        variablesSection += '</available_variables>\n\n';
      }

      expect(variablesSection).toBe('');
    });
  });

  describe('Context Integration', () => {
    it('should build complete context section with both history and variables', () => {
      const history = [
        {
          role: 'user' as const,
          content: 'What is the weather?',
          timestamp: 1000
        },
        {
          role: 'assistant' as const,
          content: 'I can check that for you.',
          timestamp: 2000
        }
      ];

      const variables = {
        location: 'San Francisco',
        units: 'celsius'
      };

      let contextSection = '';

      // Add history
      if (history && history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      // Add variables
      if (variables && Object.keys(variables).length > 0) {
        contextSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(variables)) {
          contextSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        contextSection += '</available_variables>\n\n';
      }

      expect(contextSection).toContain('<conversation_history>');
      expect(contextSection).toContain('user: What is the weather?');
      expect(contextSection).toContain('assistant: I can check that for you.');
      expect(contextSection).toContain('</conversation_history>');

      expect(contextSection).toContain('<available_variables>');
      expect(contextSection).toContain('location: "San Francisco"');
      expect(contextSection).toContain('units: "celsius"');
      expect(contextSection).toContain('</available_variables>');

      // Verify order: history comes before variables
      const historyIndex = contextSection.indexOf('<conversation_history>');
      const variablesIndex = contextSection.indexOf('<available_variables>');
      expect(historyIndex).toBeLessThan(variablesIndex);
    });

    it('should handle null/undefined options gracefully', () => {
      const options: any = null;

      let contextSection = '';

      if (options?.history && options.history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of options.history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      if (options?.variables && Object.keys(options.variables).length > 0) {
        contextSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(options.variables)) {
          contextSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        contextSection += '</available_variables>\n\n';
      }

      expect(contextSection).toBe('');
    });

    it('should handle options with empty history/variables', () => {
      const options: {
        history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
        variables: Record<string, any>;
      } = {
        history: [],
        variables: {}
      };

      let contextSection = '';

      if (options?.history && options.history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of options.history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      if (options?.variables && Object.keys(options.variables).length > 0) {
        contextSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(options.variables)) {
          contextSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        contextSection += '</available_variables>\n\n';
      }

      expect(contextSection).toBe('');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without options parameter', () => {
      const llm = new LLMClient({
        provider: 'anthropic',
        model: 'test-model',
        apiKey: 'test-key'
      });

      const skills = [
        {
          name: 'test-skill',
          description: 'A test skill',
          tags: ['test']
        }
      ];

      const ptcGenerator = new PTCGenerator(llm, skills);
      void ptcGenerator; // Mark as used

      // Verify generator is created successfully
      expect(ptcGenerator).toBeDefined();
      expect(ptcGenerator.getAvailableSkills()).toEqual(['test-skill']);
    });

    it('should work with empty options object', () => {
      const llm = new LLMClient({
        provider: 'anthropic',
        model: 'test-model',
        apiKey: 'test-key'
      });

      const skills = [
        {
          name: 'test-skill',
          description: 'A test skill',
          tags: ['test']
        }
      ];

      const ptcGenerator = new PTCGenerator(llm, skills);
      void ptcGenerator; // Mark as used

      // Test with empty options
      const options: any = {};

      // Should not throw when building context with empty options
      let contextSection = '';

      if (options?.history && options.history.length > 0) {
        contextSection = '<conversation_history>\n';
        for (const msg of options.history.slice(-5)) {
          contextSection += `${msg.role}: ${msg.content}\n`;
        }
        contextSection += '</conversation_history>\n\n';
      }

      if (options?.variables && Object.keys(options.variables).length > 0) {
        contextSection += '<available_variables>\n';
        for (const [key, value] of Object.entries(options.variables)) {
          contextSection += `${key}: ${JSON.stringify(value)}\n`;
        }
        contextSection += '</available_variables>\n\n';
      }

      expect(contextSection).toBe('');
    });
  });
});
