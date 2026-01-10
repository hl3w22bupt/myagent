/**
 * Agent + Skill Performance Benchmarks
 *
 * Tests performance characteristics of the Agent system.
 * These are NOT unit tests but benchmarks to track performance.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { SandboxFactory } from '@/core/sandbox/factory';

interface BenchmarkResult {
  name: string;
  duration: number;
  success: boolean;
  passed: boolean;
  threshold: number;
}

describe('Agent Performance Benchmarks', () => {
  let sandbox: any;
  const results: BenchmarkResult[] = [];

  beforeAll(() => {
    sandbox = SandboxFactory.create({
      type: 'local',
      config: {
        pythonPath: process.env.PYTHON_PATH || 'python3',
        timeout: 30000,
      },
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();

    let passed = 0;
    let failed = 0;

    results.forEach((result) => {
      const status = result.passed ? '✓' : '✗';
      const within = result.duration <= result.threshold;
      const statusText = within ? 'PASS' : 'FAIL';

      if (result.passed) passed++;
      else failed++;
    });
  });

  function benchmark(name: string, threshold: number, fn: () => Promise<void>) {
    return async () => {
      const start = Date.now();
      let success = false;

      try {
        await fn();
        success = true;
      } catch (error) {
        console.error(`  Error: ${error}`);
      }

      const duration = Date.now() - start;
      const passed = success && duration <= threshold;

      results.push({
        name,
        duration,
        success,
        passed,
        threshold,
      });

      expect(success).toBe(true);
      expect(duration).toBeLessThanOrEqual(threshold);
    };
  }

  describe('Sandbox Performance', () => {
    it(
      'should initialize sandbox in < 1s',
      benchmark('Sandbox Initialization', 1000, async () => {
        const testSandbox = SandboxFactory.create({
          type: 'local',
          config: { pythonPath: process.env.PYTHON_PATH || 'python3', timeout: 30000 },
        });
        expect(testSandbox).toBeDefined();
        await testSandbox.cleanup();
      })
    );

    it(
      'should execute simple code in < 500ms',
      benchmark('Simple Code Execution', 500, async () => {
        const result = await sandbox.execute('print("test")', {
          skills: [],
          skillImplPath: process.cwd(),
          sessionId: 'perf-simple',
          timeout: 5000,
        });
        expect(result.success).toBe(true);
      })
    );

    it(
      'should execute SkillExecutor import in < 2s',
      benchmark('SkillExecutor Import', 2000, async () => {
        const code = `
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor
print("OK")
`;
        const result = await sandbox.execute(code, {
          skills: [],
          skillImplPath: process.cwd(),
          sessionId: 'perf-import',
          timeout: 10000,
        });
        expect(result.success).toBe(true);
      })
    );
  });

  describe('Skill Registry Performance', () => {
    it(
      'should scan skills directory in < 3s',
      benchmark('Skill Registry Scan', 3000, async () => {
        const code = `
import sys
sys.path.insert(0, '.')
from core.skill.registry import SkillRegistry

registry = SkillRegistry()
skills = await registry.scan()
print(f"OK: {len(skills)}")
`;
        const result = await sandbox.execute(code, {
          skills: [],
          skillImplPath: process.cwd(),
          sessionId: 'perf-scan',
          timeout: 10000,
        });
        expect(result.success).toBe(true);
      })
    );

    it(
      'should load skill definition in < 1s',
      benchmark('Load Skill Definition', 1000, async () => {
        const code = `
import sys
sys.path.insert(0, '.')
from core.skill.registry import SkillRegistry

registry = SkillRegistry()
skill = await registry.load_full('summarize')
print(f"OK: {skill.name}")
`;
        const result = await sandbox.execute(code, {
          skills: [],
          skillImplPath: process.cwd(),
          sessionId: 'perf-load',
          timeout: 10000,
        });
        expect(result.success).toBe(true);
      })
    );
  });

  describe('Skill Execution Performance', () => {
    it(
      'should execute pure-prompt skill in < 5s',
      benchmark('Pure-Prompt Skill Execution', 5000, async () => {
        const code = `
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('summarize', {
    'text': 'Test text for summarization.',
    'max_length': 50
})
print(f"OK")
`;
        const result = await sandbox.execute(code, {
          skills: ['summarize'],
          skillImplPath: process.cwd(),
          sessionId: 'perf-pure-prompt',
          timeout: 15000,
        });
        expect(result.success).toBe(true);
      })
    );

    it(
      'should execute pure-script skill in < 2s',
      benchmark('Pure-Script Skill Execution', 2000, async () => {
        const code = `
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('code-analysis', {
    'code': 'def test(): pass'
})
print(f"OK")
`;
        const result = await sandbox.execute(code, {
          skills: ['code-analysis'],
          skillImplPath: process.cwd(),
          sessionId: 'perf-pure-script',
          timeout: 10000,
        });
        expect(result.success).toBe(true);
      })
    );
  });

  describe('Agent Performance', () => {
    let agent: Agent;

    beforeAll(() => {
      const sessionId = 'test-performance-session';
      agent = new Agent(
        {
          systemPrompt: 'You are a helpful assistant.',
          availableSkills: ['summarize', 'code-analysis'],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            apiKey: process.env.ANTHROPIC_API_KEY,
          },
          sandbox: {
            type: 'local',
            config: {
              pythonPath: process.env.PYTHON_PATH || 'python3',
              timeout: 30000,
            },
          },
        },
        sessionId
      );
    });

    afterAll(async () => {
      await agent.cleanup();
    });

    it(
      'should initialize agent in < 500ms',
      benchmark('Agent Initialization', 500, async () => {
        const sessionId = `test-benchmark-${Date.now()}`;
        const testAgent = new Agent(
          {
            systemPrompt: 'Test',
            availableSkills: [],
            llm: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
            sandbox: {
              type: 'local',
              config: {},
            },
          },
          sessionId
        );
        expect(testAgent).toBeDefined();
        await testAgent.cleanup();
      })
    );

    it(
      'should get agent info in < 50ms',
      benchmark('Get Agent Info', 50, async () => {
        const start = Date.now();
        const info = agent.getInfo();
        const duration = Date.now() - start;

        expect(info).toBeDefined();
        expect(duration).toBeLessThan(50);
      })
    );
  });

  describe('Memory Efficiency', () => {
    it('should handle multiple sandbox sessions efficiently', async () => {
      const sessions = [];

      for (let i = 0; i < 5; i++) {
        const result = await sandbox.execute('print("test")', {
          skills: [],
          skillImplPath: process.cwd(),
          sessionId: `perf-session-${i}`,
          timeout: 5000,
        });
        expect(result.success).toBe(true);
        sessions.push(`perf-session-${i}`);
      }

      // Cleanup all sessions
      await sandbox.cleanup();
    });
  });
});
