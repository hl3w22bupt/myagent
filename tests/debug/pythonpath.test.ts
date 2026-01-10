/**
 * Debug PYTHONPATH in Sandbox
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import * as path from 'path';
import { existsSync } from 'fs';
import { join } from 'path';

describe('PYTHONPATH Debug', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    // Find the project root by searching upward for python_modules
    let searchPath = process.cwd();
    let projectRoot = process.cwd();

    for (let i = 0; i < 5; i++) {
      const testPath = join(searchPath, 'python_modules');
      if (existsSync(testPath)) {
        projectRoot = searchPath;
        break;
      }
      searchPath = join(searchPath, '..');
    }

    const venvPython = join(projectRoot, 'venv', 'bin', 'python3');
    const pythonModulesPython = join(projectRoot, 'python_modules', 'bin', 'python3');
    // Prefer python_modules, then venv, then system python3 (for CI)
    const pythonPath = existsSync(pythonModulesPython)
      ? pythonModulesPython
      : existsSync(venvPython)
        ? venvPython
        : 'python3';

    sandbox = new LocalSandboxAdapter({
      pythonPath: pythonPath,
      timeout: 30000,
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('should have correct PYTHONPATH', async () => {
    const code = `
import sys
import os

print('=== Environment ===')
print('Executable:', sys.executable)
print('Python path:')
for p in sys.path[:5]:
    print('  -', p)

print('')
print('=== Try importing pydantic ===')
try:
    import pydantic
    print('SUCCESS: pydantic imported, version:', pydantic.__version__)
except Exception as e:
    print('ERROR:', e)

print('')
print('=== Try importing core.skill.executor ===')
try:
    from core.skill.executor import SkillExecutor
    print('SUCCESS: SkillExecutor imported')
except Exception as e:
    print('ERROR:', e)
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      sessionId: 'pythonpath-test',
      timeout: 10000,
    });

    expect(result.success).toBe(true);
  });
});
