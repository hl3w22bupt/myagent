/**
 * Debug script to test Sandbox execution
 */

import { SandboxFactory } from '../src/core/sandbox/factory';

async function main() {
  console.log('=== Sandbox Debug Test ===\n');

  console.log('Environment:');
  console.log('  PYTHON_PATH:', process.env.PYTHON_PATH);
  console.log('  PYTHONPATH:', process.env.PYTHONPATH);
  console.log('  CWD:', process.cwd());
  console.log('');

  // Create sandbox
  const sandbox = SandboxFactory.create({
    type: 'local',
    config: {
      pythonPath: process.env.PYTHON_PATH || 'python3',
      timeout: 30000,
    },
  });

  console.log('Sandbox created:', sandbox.getInfo());
  console.log('');

  // Test 1: Simple Python code
  console.log('Test 1: Simple Python code');
  const test1 = await sandbox.execute('print("Hello from Python")', {
    skills: [],
    skillImplPath: process.cwd(),
    sessionId: 'debug-test-1',
    timeout: 5000,
  });
  console.log('  Success:', test1.success);
  console.log('  Output:', test1.stdout);
  console.log('  Stderr:', test1.stderr);
  console.log('  Error:', test1.error);
  console.log('');

  // Test 2: Import SkillExecutor
  console.log('Test 2: Import SkillExecutor');
  const test2Code = `
import sys
print('Python path:', sys.path[:3])
try:
    from core.skill.executor import SkillExecutor
    print('SUCCESS: SkillExecutor imported')
except Exception as e:
    print(f'ERROR: {e}')
    import traceback
    traceback.print_exc()
`;

  const test2 = await sandbox.execute(test2Code, {
    skills: [],
    skillImplPath: process.cwd(),
    sessionId: 'debug-test-2',
    timeout: 10000,
  });
  console.log('  Success:', test2.success);
  console.log('  Output:', test2.stdout);
  console.log('  Stderr:', test2.stderr);
  console.log('  Error:', test2.error);
  console.log('');

  // Cleanup
  await sandbox.cleanup();
}

main().catch(console.error);
