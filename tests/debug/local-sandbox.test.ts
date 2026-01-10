/**
 * Debug test for LocalSandboxAdapter
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import * as path from 'path';

describe('LocalSandboxAdapter Debug', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    // Use absolute path to venv python
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3');
    const pythonPath = process.env.PYTHON_PATH || venvPython;

    console.log('Python path:', pythonPath);
    console.log('Exists:', require('fs').existsSync(pythonPath));

    sandbox = new LocalSandboxAdapter({
      pythonPath: pythonPath,
      timeout: 30000
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('should execute simple Python code', async () => {
    const result = await sandbox.execute('print("Hello")', {
      skills: [],
      skillImplPath: process.cwd(),
      sessionId: 'debug-1',
      timeout: 5000
    });

    console.log('Result:', JSON.stringify(result, null, 2));
    expect(result.success).toBe(true);
  });

  it('should execute code that imports SkillExecutor', async () => {
    const code = `
import sys
print('Python path:', sys.path[0])
from core.skill.executor import SkillExecutor
print('SUCCESS: SkillExecutor imported')
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      sessionId: 'debug-2',
      timeout: 10000
    });

    console.log('Result:', JSON.stringify(result, null, 2));
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('SUCCESS');
  });
});
