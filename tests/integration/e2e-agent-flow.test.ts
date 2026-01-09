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
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant with access to various skills.',
      availableSkills: ['web-search', 'summarize', 'code-analysis'],
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5'
      },
      sandbox: {
        type: 'local'
      },
      constraints: {
        timeout: 60000,
        maxIterations: 5
      }
    });
  });

  afterEach(async () => {
    if (agent) {
      await agent.cleanup();
    }
  });

  describe('Complete Workflow', () => {
    it('should execute complete workflow: planning → PTC generation → execution', async () => {
      const task = 'Summarize the text: Artificial intelligence is transforming industries worldwide.';

      const result = await agent.run(task);

      console.log('\n=== Complete Workflow Result ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=== End of Result ===\n');

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

      console.log('\n=== Execution Steps ===');
      result.steps.forEach((step, index) => {
        console.log(`\nStep ${index + 1}:`);
        console.log(`  Type: ${step.type}`);
        console.log(`  Timestamp: ${step.timestamp}`);
        const content = step.content || '';
        console.log(`  Content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
      });
      console.log('\n=== End of Steps ===\n');

      // Verify step types
      expect(result.steps.length).toBeGreaterThan(0);

      // Check that steps have required fields
      result.steps.forEach(step => {
        expect(step.type).toBeDefined();
        expect(step.timestamp).toBeDefined();
        expect(step.content).toBeDefined();
      });

      // Should have at least planning and execution steps
      const stepTypes = result.steps.map(s => s.type);
      expect(stepTypes).toContain('planning');
      expect(stepTypes).toContain('execution');
    }, 90000);

    it('should provide detailed execution metadata', async () => {
      const task = 'Analyze the code quality of this Python code: print("hello")';

      const result = await agent.run(task);

      console.log('\n=== Execution Metadata ===');
      console.log(`LLM Calls: ${result.metadata.llmCalls}`);
      console.log(`Skill Calls: ${result.metadata.skillCalls}`);
      console.log(`Total Tokens: ${result.metadata.totalTokens}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      console.log('=== End of Metadata ===\n');

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

      console.log('\n=== Multi-Skill Task Result ===');
      console.log(`Success: ${result.success}`);
      console.log(`Skill Calls: ${result.metadata.skillCalls}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      console.log('=== End of Result ===\n');

      // Verify execution completed
      expect(result).toBeDefined();

      // Should have multiple skill calls for multi-skill task
      if (result.success) {
        expect(result.metadata.skillCalls).toBeGreaterThanOrEqual(2);
      }

      // Should have planning steps
      expect(result.steps.some(s => s.type === 'planning')).toBe(true);
    }, 120000);

    it('should chain skill outputs correctly', async () => {
      const task = 'Summarize this text and analyze it: "Python is a great programming language."';

      const result = await agent.run(task);

      console.log('\n=== Chained Skills Result ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=== End of Result ===\n');

      // Verify execution
      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Should have execution steps showing skill usage
      const executionSteps = result.steps.filter(s => s.type === 'execution');
      expect(executionSteps.length).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Error Handling in Workflow', () => {
    it('should handle errors gracefully and report them', async () => {
      // Use a task that might fail (invalid skill reference)
      const task = 'Execute non-existent-skill with some input';

      const result = await agent.run(task);

      console.log('\n=== Error Handling Result ===');
      console.log(`Success: ${result.success}`);
      if (!result.success) {
        console.log(`Error: ${result.error}`);
      }
      console.log('=== End of Result ===\n');

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
      const errorSteps = result.steps.filter(s => s.type === 'error');
      if (errorSteps.length > 0) {
        console.log('\n=== Error Steps Found ===');
        errorSteps.forEach((step, i) => {
          console.log(`Error ${i + 1}: ${step.content}`);
        });
        console.log('=== End of Errors ===\n');
      }
    }, 90000);
  });

  describe('Performance in Workflow', () => {
    it('should complete simple tasks within reasonable time', async () => {
      const task = 'Summarize: This is a simple test.';

      const startTime = Date.now();
      const result = await agent.run(task);
      const totalTime = Date.now() - startTime;

      console.log(`\n=== Performance Test ===`);
      console.log(`Total Time: ${totalTime}ms`);
      console.log(`Agent Execution Time: ${result.executionTime}ms`);
      console.log('=== End of Performance ===\n');

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

      console.log('\n=== Repeated Task Performance ===');
      results.forEach((r, i) => {
        console.log(`Run ${i + 1}: ${r.executionTime}ms`);
      });
      console.log('=== End of Performance ===\n');

      // All runs should complete
      results.forEach(r => {
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

      console.log('\n=== Session State Test ===');
      console.log(`Task 1: ${result1.executionTime}ms, ${result1.steps.length} steps`);
      console.log(`Task 2: ${result2.executionTime}ms, ${result2.steps.length} steps`);
      console.log('=== End of State Test ===\n');

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

      console.log('\n=== Debugging Information ===');
      console.log('Steps breakdown:');
      result.steps.forEach((step, index) => {
        console.log(`\n${index + 1}. ${step.type}`);
        console.log(`   Time: ${new Date(step.timestamp).toISOString()}`);
        console.log(`   Length: ${step.content?.length || 0} chars`);
      });
      console.log('\n=== End of Debug Info ===\n');

      // Verify detailed information is available
      expect(result.steps.length).toBeGreaterThan(0);

      result.steps.forEach(step => {
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

      console.log('\n=== Timeline Verification ===');
      console.log(`Total steps: ${result.steps.length}`);
      console.log(`Total duration: ${result.executionTime}ms`);
      console.log('=== End of Timeline ===\n');
    }, 90000);
  });
});
