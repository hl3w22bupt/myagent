/**
 * PTC Generation and Execution Tests
 *
 * Tests the PTC (Python Task Code) generation capabilities of the Agent system.
 * Verifies that the PTCGenerator can create valid Python code that uses skills.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PTCGenerator } from '@/core/agent/ptc-generator';
import { LLMClient } from '@/core/agent/llm-client';

describe('PTC Generation and Execution', () => {
  let ptcGenerator: PTCGenerator;
  let llm: LLMClient;

  beforeAll(() => {
    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  ANTHROPIC_API_KEY not set - PTC generation tests will be skipped');
    }

    // Initialize LLM client
    llm = new LLMClient({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
    });

    // Define available skills
    const skills = [
      {
        name: 'summarize',
        description: 'Summarize text content',
        tags: ['text', 'summarization', 'nlp'],
      },
      {
        name: 'code-analysis',
        description: 'Analyze code quality and patterns',
        tags: ['code', 'analysis', 'quality'],
      },
      {
        name: 'web-search',
        description: 'Search the web for information',
        tags: ['web', 'research', 'search'],
      },
    ];

    // Initialize PTC generator
    ptcGenerator = new PTCGenerator(llm, skills);
  });

  describe('PTC Code Generation', () => {
    it('should generate valid Python PTC code', async () => {
      // Skip if no API key
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Search for "TypeScript best practices" and summarize the results';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC Code:');
      console.log(ptcCode);
      console.log('\n--- End of PTC Code ---\n');

      // Verify it's valid Python code structure
      expect(ptcCode).toBeDefined();
      expect(typeof ptcCode).toBe('string');
      expect(ptcCode.length).toBeGreaterThan(0);

      // Should contain async/await pattern
      expect(ptcCode).toMatch(/async/);
      expect(ptcCode).toMatch(/await/);

      // Should contain executor usage
      expect(ptcCode.toLowerCase()).toContain('executor');
    }, 60000);

    it('should generate code with correct skill usage', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Summarize this text: Hello world, this is a test.';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC for summarize task:');
      console.log(ptcCode);

      // Should use summarize skill
      const lowerCode = ptcCode.toLowerCase();
      expect(lowerCode).toContain('summarize');

      // Should contain skill input parameters
      expect(ptcCode).toContain("'content':");
      expect(ptcCode).toContain("'max_length':");

      // Should have print statement for result
      expect(ptcCode).toMatch(/print\(/);
    }, 60000);

    it('should handle multi-step tasks', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Search for "AI trends" and analyze the code quality of the results';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC for multi-step task:');
      console.log(ptcCode);

      // Should use multiple skills (at least 2 executor.execute calls)
      const executeCount = (ptcCode.match(/executor\.execute/g) || []).length;
      expect(executeCount).toBeGreaterThanOrEqual(2);

      // Should have async structure
      expect(ptcCode).toMatch(/async def main\(\)/);
    }, 60000);

    it('should include error handling in generated code', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Execute web-search with query "test"';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC with error handling:');
      console.log(ptcCode);

      // Generated code should have proper structure
      expect(ptcCode).toMatch(/async def main\(\)/);
      expect(ptcCode).toMatch(/try:/);
      expect(ptcCode).toMatch(/except/);
    }, 60000);
  });

  describe('PTC Code Validation', () => {
    it('should generate code with proper imports', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Test task';

      const ptcCode = await ptcGenerator.generate(task);

      // Check for common Python patterns
      expect(ptcCode).toBeDefined();

      // Should not have obvious syntax errors (basic check)
      // The code should be balanced in terms of parentheses and brackets
      const openParens = (ptcCode.match(/\(/g) || []).length;
      const closeParens = (ptcCode.match(/\)/g) || []).length;
      expect(openParens).toBe(closeParens);

      const openBrackets = (ptcCode.match(/\[/g) || []).length;
      const closeBrackets = (ptcCode.match(/\]/g) || []).length;
      expect(openBrackets).toBe(closeBrackets);
    }, 60000);

    it('should use skill names correctly', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      // Test with known skill names
      const task = 'Use the summarize skill';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC with skill names:');
      console.log(ptcCode);

      // Should reference the skill correctly
      expect(ptcCode.toLowerCase()).toContain('summarize');

      // Skill name should be in quotes (as a string)
      expect(ptcCode).toMatch(/['"]summarize['"]/);
    }, 60000);
  });

  describe('PTC Execution Characteristics', () => {
    it('should generate code that prints results', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Summarize: This is a test document.';

      const ptcCode = await ptcGenerator.generate(task);

      // Should contain print statement
      expect(ptcCode).toMatch(/print\(/);

      // Print should be for output or result
      expect(ptcCode.toLowerCase()).toMatch(/print.*result|print.*output/);
    }, 60000);

    it('should generate async code structure', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Any task';

      const ptcCode = await ptcGenerator.generate(task);

      // Should have async main function
      expect(ptcCode).toMatch(/async def main\(\)/);

      // Should have asyncio.run
      expect(ptcCode).toMatch(/asyncio\.run\(main\(\)\)/);

      // Should use await for skill calls
      const awaitCount = (ptcCode.match(/await/g) || []).length;
      expect(awaitCount).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Edge Cases', () => {
    it('should handle very short tasks', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task = 'Test';

      const ptcCode = await ptcGenerator.generate(task);

      expect(ptcCode).toBeDefined();
      expect(ptcCode.length).toBeGreaterThan(0);
    }, 60000);

    it('should handle complex multi-skill tasks', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping test - ANTHROPIC_API_KEY not set');
        return;
      }

      const task =
        'Search for "Python async programming", summarize the top 3 results, and analyze the code quality';

      const ptcCode = await ptcGenerator.generate(task);

      console.log('Generated PTC for complex task:');
      console.log(ptcCode);

      // Should use multiple skills
      const executeCount = (ptcCode.match(/executor\.execute/g) || []).length;
      expect(executeCount).toBeGreaterThanOrEqual(2);
    }, 90000);
  });
});
