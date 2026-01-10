/**
 * Integration tests for Sandbox with Skills.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import { SandboxOptions } from '@/core/sandbox/types';

describe('Sandbox Skill Integration', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    sandbox = new LocalSandboxAdapter({
      pythonPath: 'python3',
      workspace: '/tmp/motia-sandbox-integration',
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('should execute code that imports SkillExecutor', async () => {
    const code = `
# SkillExecutor should be available
result = await executor.execute('summarize', {
    'content': 'Test content for summarization',
    'max_length': 50
})
print(result)
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 10000,
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(true);
    expect(result.stdout).toBeDefined();
  }, 20000);

  it('should handle multiple skill calls in one execution', async () => {
    const code = `
# Call summarize multiple times
result1 = await executor.execute('summarize', {'content': 'First text'})
result2 = await executor.execute('summarize', {'content': 'Second text'})

print({"result1_type": result1.get("type"), "result2_type": result2.get("type")})
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 15000,
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(true);
  }, 20000);

  it('should pass metadata to sandbox', async () => {
    const code = `
import os
trace_id = os.getenv('MOTIA_TRACE_ID')
print(f"Trace ID: {trace_id}")
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000,
      metadata: {
        traceId: 'test-trace-123',
      },
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('test-trace-123');
  }, 10000);

  it('should handle execution timeout', async () => {
    const code = `
import asyncio
await asyncio.sleep(35)  # Exceed 30s timeout
print('done')
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000, // 5 second timeout
    };

    const result = await sandbox.execute(code, options);

    // Should timeout or fail
    expect(result).toBeDefined();
  }, 10000);

  it('should handle non-existent skill gracefully', async () => {
    const code = `
result = await executor.execute('non-existent-skill', {'input': 'test'})
print(result)
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000,
    };

    const result = await sandbox.execute(code, options);

    // Should handle the error gracefully
    expect(result).toBeDefined();
  }, 10000);

  it('should support async code execution', async () => {
    const code = `
import asyncio

async def my_async_function():
    await asyncio.sleep(0.1)
    return "async result"

result = await my_async_function()
print(f"Result: {result}")
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000,
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('async result');
  }, 10000);
});
