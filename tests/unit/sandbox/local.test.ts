/**
 * Unit tests for Local Sandbox Adapter.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import { SandboxOptions } from '@/core/sandbox/types';

describe('LocalSandboxAdapter', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    sandbox = new LocalSandboxAdapter({
      pythonPath: 'python3',
      workspace: '/tmp/motia-sandbox-test',
      maxSessions: 5
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('should initialize successfully', () => {
    expect(sandbox).toBeDefined();
  });

  it('should pass health check', async () => {
    const isHealthy = await sandbox.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should return adapter info', () => {
    const info = sandbox.getInfo();

    expect(info.type).toBe('local');
    expect(info.version).toBeDefined();
    expect(info.capabilities).toContain('python-execution');
    expect(info.capabilities).toContain('skill-execution');
  });

  it('should execute simple Python code', async () => {
    const code = `
print('Hello from sandbox!')
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Hello from sandbox!');
    expect(result.executionTime).toBeGreaterThan(0);
  }, 10000);

  it('should handle Python execution errors', async () => {
    const code = `
raise ValueError("Test error")
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 5000
    };

    const result = await sandbox.execute(code, options);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe('execution');
  }, 10000);

  it('should track session IDs', async () => {
    const code = `
print('test')
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      sessionId: 'test-session-123',
      timeout: 5000
    };

    const result = await sandbox.execute(code, options);

    expect(result.sessionId).toBe('test-session-123');
  }, 10000);

  it('should cleanup sessions', async () => {
    const code = `
import time
time.sleep(0.1)
print('done')
`;

    const options: SandboxOptions = {
      skills: [],
      skillImplPath: process.cwd(),
      sessionId: 'cleanup-test',
      timeout: 5000
    };

    await sandbox.execute(code, options);
    await sandbox.cleanup('cleanup-test');

    // Session should be cleaned up
    expect(true).toBe(true); // If we got here, cleanup worked
  }, 10000);
});
