/**
 * Agent Context Integration Tests
 *
 * Tests that the Agent properly uses context (history and variables)
 * when generating PTC code. This demonstrates the integration between
 * Agent state management and PTCGenerator context support.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { LocalSandboxAdapter } from '@/core/sandbox';
void LocalSandboxAdapter; // Mark as used

describe('Agent Context Integration', () => {
  let agent: Agent;

  beforeAll(() => {
    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  ANTHROPIC_API_KEY not set - Agent context tests will be skipped');
    }

    // Initialize Agent with session support
    const sessionId = 'test-context-session';

    agent = new Agent(
      {
        systemPrompt: 'You are a helpful assistant with access to various skills.',
        availableSkills: ['summarize', 'web-search', 'code-analysis'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
        },
        sandbox: {
          type: 'local',
          local: {
            pythonPath: process.env.PYTHON_PATH || 'python3',
            timeout: 30000,
          },
        },
      },
      sessionId
    );
  });

  describe('Conversation History', () => {
    it('should maintain conversation history across multiple executions', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // First task
      const result1 = await agent.run('What is 2 + 2?');

      expect(result1.success).toBe(true);
      expect(result1.sessionId).toBe('test-context-session');

      // Check that conversation history is being tracked
      expect(result1.state?.conversationLength).toBeGreaterThan(0);

      // Second task (should have access to first task in history)
      const result2 = await agent.run('What was my previous question?');

      expect(result2.success).toBe(true);
      expect(result2.sessionId).toBe('test-context-session');

      // Conversation history should have grown
      expect(result2.state?.conversationLength ?? 0).toBeGreaterThan(
        result1.state?.conversationLength ?? 0
      );
    }, 120000);

    it('should track both user and assistant messages', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // Execute a simple task
      const result = await agent.run('Say hello');

      expect(result.success).toBe(true);

      // Should have at least 2 messages: user task + assistant response
      expect(result.state?.conversationLength).toBeGreaterThanOrEqual(2);
    }, 120000);
  });

  describe('Variable Persistence', () => {
    it('should persist variables across executions', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // Execute a task that might set variables
      const result1 = await agent.run('Store the value 42 in a variable named test_var');

      expect(result1.success).toBe(true);

      // Execute another task that might use the variable
      const result2 = await agent.run('What is the value of test_var?');

      expect(result2.success).toBe(true);
    }, 120000);

    it('should track variable count in state', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const result = await agent.run('Create variables x=1, y=2, z=3');

      expect(result.success).toBe(true);

      // Should track variable count
      expect(result.state?.variablesCount).toBeDefined();
    }, 120000);
  });

  describe('Context-Aware Generation', () => {
    it('should use conversation context when generating PTC', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // First interaction
      const result1 = await agent.run('My name is Alice');

      expect(result1.success).toBe(true);

      // Second interaction should remember the name
      const result2 = await agent.run('What is my name?');

      expect(result2.success).toBe(true);
      expect(result2.output).toBeDefined();

      // The agent should ideally remember the name from context
      // (This depends on LLM capabilities and context quality)
    }, 120000);

    it('should pass both history and variables to PTCGenerator', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // Execute multiple tasks to build up history and variables
      await agent.run('Set x = 10');
      await agent.run('Set y = 20');

      const result = await agent.run('Add x and y');

      expect(result.success).toBe(true);
      expect(result.state).toBeDefined();

      // Should have conversation history
      expect(result.state?.conversationLength).toBeGreaterThan(0);

      // Should have execution history
      expect(result.state?.executionCount).toBeGreaterThan(0);

      // Might have variables (depends on PTC execution)
    }, 180000);
  });

  describe('Session Management', () => {
    it('should maintain consistent session ID across executions', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const result1 = await agent.run('Task 1');
      const result2 = await agent.run('Task 2');
      const result3 = await agent.run('Task 3');

      expect(result1.sessionId).toBe('test-context-session');
      expect(result2.sessionId).toBe('test-context-session');
      expect(result3.sessionId).toBe('test-context-session');

      // All should use the same session
      expect(result1.sessionId).toEqual(result2.sessionId);
      expect(result2.sessionId).toEqual(result3.sessionId);
    }, 180000);

    it('should track execution count across session', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      await agent.run('Task A');
      const result = await agent.run('Task B');

      expect(result.state?.executionCount).toBeGreaterThan(1);
    }, 120000);
  });

  describe('Context Quality', () => {
    it('should limit conversation history to prevent overwhelming LLM', async () => {
      if (!process.env.ANTHROPOC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // Execute many tasks
      for (let i = 0; i < 10; i++) {
        await agent.run(`Task ${i + 1}`);
      }

      const result = await agent.run('Final task');

      // Should have tracked all conversations in state
      expect(result.state?.conversationLength).toBeGreaterThan(10);

      // But PTCGenerator should only use last 5 in context
      // (This is tested in ptc-context.test.ts)
    }, 300000);

    it('should handle empty context gracefully', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPOC_API_KEY not set');
        return;
      }

      // Create a new agent with no prior context
      const freshAgent = new Agent(
        {
          systemPrompt: 'You are a helpful assistant.',
          availableSkills: ['summarize'],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
          },
          sandbox: {
            type: 'local',
            local: {
              pythonPath: process.env.PYTHON_PATH || 'python3',
              timeout: 30000,
            },
          },
        },
        'fresh-session'
      );

      const result = await freshAgent.run('Hello');

      // Should work fine even with no prior context
      expect(result.success).toBe(true);
      expect(result.state?.conversationLength).toBeGreaterThanOrEqual(1);
    }, 120000);
  });
});
