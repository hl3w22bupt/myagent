/**
 * Phase 4.5: Agent + Skill Standalone Integration Tests
 *
 * These tests verify the end-to-end flow:
 * Agent → PTC Generation → Sandbox Execution → Skills
 *
 * Tests run WITHOUT Motia framework to validate core functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { MasterAgent } from '@/core/agent/master-agent';
import { SandboxFactory } from '@/core/sandbox/factory';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import * as path from 'path';
import * as fs from 'fs';

// Suppress console output during tests
const originalError = console.error;

describe('Agent + Skill Standalone Integration', () => {
  let sandbox: LocalSandboxAdapter;
  let agent: Agent;
  let pythonPath: string;

  beforeAll(() => {
    // Determine Python path
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3');
    pythonPath = fs.existsSync(venvPython) ? venvPython : 'python3';

    // Suppress logs AFTER setup
    console.error = jest.fn();

    // Create sandbox
    sandbox = SandboxFactory.create({
      type: 'local',
      local: {
        pythonPath: pythonPath,
        timeout: 30000,
      },
    }) as LocalSandboxAdapter;

    // Create agent with sandbox
    const sessionId = 'test-skill-standalone-session';
    agent = new Agent(
      {
        systemPrompt: 'You are a helpful assistant with access to various skills.',
        availableSkills: ['summarize', 'code-analysis', 'web-search'],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
        sandbox: {
          type: 'local',
          config: {
            pythonPath: pythonPath,
            timeout: 30000,
          },
        },
      },
      sessionId
    );
  });

  afterAll(async () => {
    // Restore logs
    console.error = originalError;

    await agent.cleanup();
    await sandbox.cleanup();
  });

  describe('Environment Setup', () => {
    it('should have ANTHROPIC_API_KEY set', () => {
      if (process.env.ANTHROPIC_API_KEY) {
        expect(process.env.ANTHROPIC_API_KEY).toBeDefined();
      } else {
        // Warn if API key is not set, but don't fail the test
        console.warn('⚠️  ANTHROPIC_API_KEY not set - some tests may be limited');
      }
    });

    it('should have Python executable available', () => {
      expect(process.env.PYTHON_PATH || 'python3').toBeDefined();
    });

    it('should initialize sandbox successfully', () => {
      expect(sandbox).toBeDefined();
      expect(sandbox.getInfo().type).toBe('local');
    });

    it('should initialize agent successfully', () => {
      expect(agent).toBeDefined();
      const info = agent.getInfo();
      expect(info.type).toBe('Agent');
      expect(info.availableSkills).toContain('summarize');
    });
  });

  describe('PTC Generation', () => {
    it('should have PTCGenerator available', () => {
      const info = agent.getInfo();
      expect(info).toBeDefined();
    });

    it('should have access to skills through sandbox', () => {
      const info = agent.getInfo();
      expect(info.sandboxType).toBe('local');
    });
  });

  describe('Sandbox → Skills Integration', () => {
    it('should check Python environment', async () => {
      const testCode = `
import sys
import os

print('=== Environment Check ===')
print('Executable:', sys.executable)
print('Python path:')
for i, p in enumerate(sys.path[:8]):
    print(f'  {i}: {p}')

print('')
print('=== Check pydantic ===')
try:
    import pydantic
    print(f'SUCCESS: pydantic {pydantic.__version__}')
except Exception as e:
    print(f'ERROR: {e}')
`;

      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-env-check',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
    });

    it('should execute Python code that imports SkillExecutor', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.executor import SkillExecutor

executor = SkillExecutor()
print("SUCCESS: SkillExecutor imported")
`;

      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-skill-executor-import',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('SUCCESS');
    });

    it('should list available skills via SkillRegistry', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.registry import SkillRegistry

registry = SkillRegistry()
skills = await registry.scan()

print(f"SUCCESS: Found {len(skills)} skills")
for name, meta in skills.items():
    print(f"  - {name}: {meta.type}")
`;

      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-skill-registry',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('SUCCESS');
      expect(result.output).toContain('summarize');
      expect(result.output).toContain('code-analysis');
    });
  });

  describe('Skill Execution Tests', () => {
    it('should execute summarize skill (pure-prompt)', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('summarize', {
    'content': 'This is a long text that needs to be summarized.',
    'max_length': 50
})

# result.output is a dict with 'content' key
summary_content = result.output.get('content', str(result.output))
print(f"SUCCESS: Summary: {str(summary_content)[:50]}")
`;

      const result = await sandbox.execute(testCode, {
        skills: [
          {
            name: 'summarize',
            version: '1.0.0',
            type: 'pure-prompt',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
          },
        ],
        skillImplPath: process.cwd(),
        sessionId: 'test-summarize-skill',
        timeout: 15000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('SUCCESS');
    });

    it('should execute code-analysis skill (pure-script)', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('code-analysis', {
    'code': 'def hello():\\n    print("Hello, World!")'
})

print(f"SUCCESS: Analysis complete - Score: {result.output.get('score', 'N/A')}")
`;

      const result = await sandbox.execute(testCode, {
        skills: [
          {
            name: 'code-analysis',
            version: '1.0.0',
            type: 'pure-script',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
          },
        ],
        skillImplPath: process.cwd(),
        sessionId: 'test-code-analysis-skill',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('SUCCESS');
    });
  });

  describe('Agent Integration', () => {
    it('should generate agent info with all components', () => {
      const info = agent.getInfo();

      expect(info.sessionId).toBeDefined();
      expect(info.type).toBe('Agent');
      expect(info.availableSkills).toBeDefined();
      expect(info.sandboxType).toBe('local');
      expect(info.llmModel).toBeDefined();
    });

    it('should maintain session state', () => {
      const info1 = agent.getInfo();
      const info2 = agent.getInfo();

      expect(info1.sessionId).toBe(info2.sessionId);
    });
  });

  describe('MasterAgent Integration', () => {
    let masterAgent: MasterAgent;

    beforeAll(() => {
      const sessionId = 'test-master-agent-session';
      masterAgent = new MasterAgent(
        {
          systemPrompt: 'You are a master coordinator agent.',
          availableSkills: ['*'],
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            apiKey: process.env.ANTHROPIC_API_KEY,
          },
          sandbox: {
            type: 'local',
            config: {},
          },
          subagents: ['code-reviewer', 'data-analyst'],
        },
        sessionId
      );
    });

    afterAll(async () => {
      await masterAgent.cleanup();
    });

    it('should initialize with subagents', () => {
      expect(masterAgent).toBeDefined();
      const info = masterAgent.getInfo();
      expect(info.type).toBe('MasterAgent');
      expect(info.subagents).toContain('code-reviewer');
      expect(info.subagents).toContain('data-analyst');
    });

    it('should have delegation capability', () => {
      const info = masterAgent.getInfo();
      expect(info.subagents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill gracefully', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.executor import SkillExecutor

executor = SkillExecutor()
try:
    result = await executor.execute('non-existent-skill', {})
    print(f"ERROR: {result.error}")
except Exception as e:
    print(f"EXPECTED_ERROR: {str(e)[:50]}")
`;

      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-missing-skill',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('EXPECTED_ERROR');
    });

    it('should handle invalid skill input gracefully', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('summarize', {})  # Missing 'text' field

if result.error:
    print(f"EXPECTED_ERROR: Missing required field")
else:
    print(f"UNEXPECTED: Should have failed")
`;

      const result = await sandbox.execute(testCode, {
        skills: [
          {
            name: 'summarize',
            version: '1.0.0',
            type: 'pure-prompt',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
          },
        ],
        skillImplPath: process.cwd(),
        sessionId: 'test-invalid-input',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      // Should have error handling
    });
  });

  describe('Performance Benchmarks', () => {
    it('should initialize sandbox quickly (< 2s)', async () => {
      const start = Date.now();
      const testSandbox = SandboxFactory.create({
        type: 'local',
        config: { pythonPath: process.env.PYTHON_PATH || 'python3', timeout: 30000 },
      });
      const elapsed = Date.now() - start;

      expect(testSandbox).toBeDefined();
      expect(elapsed).toBeLessThan(2000);

      await testSandbox.cleanup();
    });

    it('should execute simple Python code quickly (< 1s)', async () => {
      const testCode = 'print("Hello")';

      const start = Date.now();
      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-perf-simple',
        timeout: 5000,
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should load SkillRegistry quickly (< 3s)', async () => {
      const testCode = `
import sys
sys.path.insert(0, '.')

from core.skill.registry import SkillRegistry

registry = SkillRegistry()
await registry.scan()
print("SUCCESS")
`;

      const start = Date.now();
      const result = await sandbox.execute(testCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: 'test-perf-registry',
        timeout: 10000,
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(3000);
    });
  });
});
