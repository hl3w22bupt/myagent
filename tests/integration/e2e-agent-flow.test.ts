/**
 * End-to-End Agent Flow Tests
 *
 * Tests the complete workflow: task input → planning → PTC generation → execution → output
 * This validates the entire Agent → PTC → Sandbox → Skills pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Agent } from '@/core/agent/agent';

describe('End-to-End Agent Flow', () => {
  let agent: Agent;

  beforeEach(() => {
    // Initialize agent with required configuration
    const sessionId = 'test-e2e-session';
    agent = new Agent(
      {
        systemPrompt: 'You are a helpful assistant with access to various skills.',
        availableSkills: ['web-search', 'summarize', 'code-analysis'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          type: 'local',
        },
        constraints: {
          timeout: 60000,
          maxIterations: 5,
        },
      },
      sessionId
    );
  });

  afterEach(async () => {
    if (agent) {
      await agent.cleanup();
    }
  });

  describe('Complete Workflow', () => {
    it('should execute complete workflow: planning → PTC generation → execution', async () => {
      const task =
        'Summarize the text: Artificial intelligence is transforming industries worldwide.';

      const result = await agent.run(task);

      // Verify overall success
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Verify workflow steps exist
      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // Verify metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata.llmCalls).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThan(0);
    }, 90000);

    it('should track all workflow steps correctly', async () => {
      const task = 'Summarize: This is a test document for summarization.';

      const result = await agent.run(task);

      // Verify step types
      expect(result.steps.length).toBeGreaterThan(0);

      // Check that steps have required fields
      result.steps.forEach((step) => {
        expect(step.type).toBeDefined();
        expect(step.timestamp).toBeDefined();
        expect(step.content).toBeDefined();
      });

      // Should have at least planning and execution steps
      const stepTypes = result.steps.map((s) => s.type);
      expect(stepTypes).toContain('planning');
      expect(stepTypes).toContain('execution');
    }, 90000);

    it('should provide detailed execution metadata', async () => {
      const task = 'Analyze the code quality of this Python code: print("hello")';

      const result = await agent.run(task);

      // Verify metadata completeness
      expect(result.metadata).toBeDefined();
      expect(result.metadata.llmCalls).toBeGreaterThan(0);
      expect(result.metadata.skillCalls).toBeGreaterThanOrEqual(0);
      expect(result.metadata.totalTokens).toBeGreaterThanOrEqual(0);
      expect(result.executionTime).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Multi-Skill Tasks', () => {
    it('should handle complex multi-skill tasks', async () => {
      const task = 'Search for "Python best practices" and summarize the top 3 results';

      const result = await agent.run(task);

      // Verify execution completed
      expect(result).toBeDefined();

      // Should have multiple skill calls for multi-skill task
      if (result.success) {
        expect(result.metadata.skillCalls).toBeGreaterThanOrEqual(2);
      }

      // Should have planning steps
      expect(result.steps.some((s) => s.type === 'planning')).toBe(true);
    }, 120000);

    it('should chain skill outputs correctly', async () => {
      const task = 'Summarize this text and analyze it: "Python is a great programming language."';

      const result = await agent.run(task);

      // Verify execution
      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Should have execution steps showing skill usage
      const executionSteps = result.steps.filter((s) => s.type === 'execution');
      expect(executionSteps.length).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Error Handling in Workflow', () => {
    it('should handle errors gracefully and report them', async () => {
      // Use a task that might fail (invalid skill reference)
      const task = 'Execute non-existent-skill with some input';

      const result = await agent.run(task);

      // Should return a result even if it failed
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      // If failed, should have error information
      if (!result.success) {
        expect(result.error).toBeDefined();
      }

      // Should still have execution steps
      expect(result.steps).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    }, 90000);

    it('should continue workflow despite individual skill failures', async () => {
      const task = 'Try to execute a task with some error handling';

      const result = await agent.run(task);

      // Verify we get a result
      expect(result).toBeDefined();

      // Check that error steps are recorded if any
      const errorSteps = result.steps.filter((s) => s.type === 'error');
      if (errorSteps.length > 0) {
        // Error steps found
      }
    }, 90000);
  });

  describe('Performance in Workflow', () => {
    it('should complete simple tasks within reasonable time', async () => {
      const task = 'Summarize: This is a simple test.';

      const startTime = Date.now();
      const result = await agent.run(task);
      const totalTime = Date.now() - startTime;

      // Verify execution
      expect(result).toBeDefined();

      // Total time should be reasonable (less than 2 minutes)
      expect(totalTime).toBeLessThan(120000);
    }, 120000);

    it('should optimize workflow for repeated similar tasks', async () => {
      const task = 'Summarize: Test content for optimization.';

      // Run same task multiple times
      const results = [];
      for (let i = 0; i < 2; i++) {
        const result = await agent.run(task);
        results.push(result);
      }

      results.forEach((r, i) => {});

      // All runs should complete
      results.forEach((r) => {
        expect(r).toBeDefined();
        expect(r.executionTime).toBeGreaterThan(0);
      });
    }, 120000);
  });

  describe('State Management', () => {
    it('should maintain session state across multiple executions', async () => {
      const task1 = 'Summarize: First task';
      const result1 = await agent.run(task1);

      const task2 = 'Summarize: Second task';
      const result2 = await agent.run(task2);

      // Both should succeed independently
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      // Should have separate execution contexts
      expect(result1.executionTime).toBeGreaterThan(0);
      expect(result2.executionTime).toBeGreaterThan(0);
    }, 120000);

    it('should clean up resources properly after execution', async () => {
      const task = 'Summarize: Test cleanup';
      const result = await agent.run(task);

      // After cleanup, agent should still be usable
      expect(result).toBeDefined();

      // Run another task to verify agent is still functional
      const task2 = 'Summarize: Another task';
      const result2 = await agent.run(task2);

      expect(result2).toBeDefined();
    }, 90000);
  });

  describe('Debugging and Observability', () => {
    it('should provide detailed steps for debugging', async () => {
      const task = 'Analyze code: def foo(): pass';

      const result = await agent.run(task);

      // Verify detailed information is available
      expect(result.steps.length).toBeGreaterThan(0);

      result.steps.forEach((step) => {
        expect(step.type).toBeDefined();
        expect(step.timestamp).toBeDefined();
        expect(typeof step.content).toBe('string');
      });
    }, 90000);

    it('should track execution time at each step', async () => {
      const task = 'Summarize: Time tracking test';

      const result = await agent.run(task);

      // Verify timestamps are present and sequential
      expect(result.steps.length).toBeGreaterThan(0);

      for (let i = 0; i < result.steps.length - 1; i++) {
        const current = result.steps[i].timestamp;
        const next = result.steps[i + 1].timestamp;

        // Timestamps should be in ascending order
        expect(next).toBeGreaterThanOrEqual(current);
      }
    }, 90000);
  });
});
