/**
 * Debug PYTHONPATH in Sandbox
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import * as path from 'path';

describe('PYTHONPATH Debug', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3');
    sandbox = new LocalSandboxAdapter({
      pythonPath: venvPython,
      timeout: 30000
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
      timeout: 10000
    });

    console.log('Result:', result);
    expect(result.success).toBe(true);
  });
});
