/**
 * E2E Integration Test for Remotion Generator
 *
 * This test runs the bash script to perform full integration testing.
 * It's excluded from normal test runs and must be run explicitly.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const E2E_SCRIPT = path.join(PROJECT_ROOT, 'tests/integration/test-e2e.sh');

describe('E2E Integration Tests', () => {
  // Mark as e2e test
  jest.setTimeout(300000); // 5 minutes

  it('should generate a video from natural language description', () => {
    // Check if script exists
    expect(fs.existsSync(E2E_SCRIPT)).toBe(true);

    // Make sure script is executable
    try {
      fs.chmodSync(E2E_SCRIPT, 0o755);
    } catch (e) {
      // Ignore if we can't change permissions
    }

    // Run the e2e test script
    try {
      const output = execSync(`bash "${E2E_SCRIPT}"`, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: process.env.PATH,
        },
      });

      expect(output.toString()).toContain('测试通过');
    } catch (error: any) {
      // Test failed
      throw new Error(`E2E test failed: ${error.message}`);
    }
  }, 300000); // 5 minute timeout
});
