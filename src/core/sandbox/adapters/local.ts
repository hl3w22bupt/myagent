/**
 * Local Sandbox Adapter.
 *
 * Executes PTC code in isolated local Python processes.
 * This is the simplest and most portable Sandbox implementation.
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  SandboxAdapter,
  SandboxOptions,
  SandboxResult,
  SandboxInfo,
  LocalSandboxConfig,
} from '../types';

export class LocalSandboxAdapter implements SandboxAdapter {
  private pythonPath: string;
  private workspace: string;
  private maxSessions: number;
  private activeSessions: Map<string, ChildProcess>;

  constructor(config: LocalSandboxConfig = {}) {
    this.pythonPath = config.pythonPath || 'python3';
    this.workspace = config.workspace || '/tmp/motia-sandbox';
    this.maxSessions = config.maxSessions || 10;
    this.activeSessions = new Map();
  }

  async execute(code: string, options: SandboxOptions): Promise<SandboxResult> {
    const sessionId = options.sessionId || uuidv4();
    const startTime = Date.now();

    try {
      // Check session limit
      if (this.activeSessions.size >= this.maxSessions) {
        throw new Error(`Maximum sessions limit reached: ${this.maxSessions}`);
      }

      // Ensure workspace exists
      await this.ensureWorkspace();

      // 1. Wrap PTC code with SkillExecutor
      const wrappedCode = this.wrapCode(code, options);

      // 2. Write to temporary file
      const scriptPath = join(this.workspace, `script_${sessionId}.py`);
      await writeFile(scriptPath, wrappedCode, 'utf-8');

      // 3. Spawn Python process
      const skillPath = options.skillImplPath || process.cwd();

      // Determine if pythonPath is in a venv
      const venvMatch = this.pythonPath.match(/^(.+\/venv\/)bin\/python3$/);
      const pythonPaths = [skillPath];

      if (venvMatch) {
        // Add venv site-packages to path
        const venvPath = venvMatch[1];
        const sitePackages = join(venvPath, 'lib', 'python3.11', 'site-packages');
        pythonPaths.push(sitePackages);
      }

      const pythonPath = pythonPaths.join(':');

      const childProcess = spawn(this.pythonPath, [scriptPath], {
        env: {
          ...process.env,
          MOTIA_TRACE_ID: options.metadata?.traceId || sessionId,
          MOTIA_SKILL_PATH: skillPath,
          PYTHONPATH: pythonPath,
          ...options.env,
        },
        timeout: options.timeout || 30000,
      });

      this.activeSessions.set(sessionId, childProcess);

      // 4. Collect output
      const result = await this.collectResult(childProcess);

      // 5. Cleanup
      await unlink(scriptPath).catch(() => {});
      this.activeSessions.delete(sessionId);

      const executionTime = Date.now() - startTime;

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error:
          result.exitCode !== 0
            ? {
                type: 'execution',
                message: result.stderr || 'Unknown error',
              }
            : undefined,
        executionTime,
        sessionId,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          type: error.code === 'ETIMEDOUT' ? 'timeout' : 'unknown',
          message: error.message,
          stack: error.stack,
        },
        executionTime: Date.now() - startTime,
        sessionId,
      };
    }
  }

  private wrapCode(code: string, options: SandboxOptions): string {
    /**
     * Wrap PTC code to inject SkillExecutor and handle execution.
     *
     * The wrapper:
     * 1. Sets up Python path (including src/ directory)
     * 2. Creates SkillExecutor instance for skill execution
     * 3. Wraps user code in async main()
     * 4. Handles exceptions
     */
    return `
import asyncio
import sys
import os
import json

# Add skill path to Python path
skill_path = os.getenv('MOTIA_SKILL_PATH', '${options.skillImplPath || ''}')
if skill_path and skill_path not in sys.path:
    sys.path.insert(0, skill_path)

# Also add src/ directory to path for importing core modules
src_path = os.path.join(skill_path if skill_path else '.', 'src')
if os.path.exists(src_path) and src_path not in sys.path:
    sys.path.insert(0, src_path)

# Also add python_modules to path (try both python3.11 and python3.13)
import glob
python_modules_paths = glob.glob(os.path.join(os.path.dirname(skill_path) if skill_path else '.', 'python_modules', 'lib', 'python3.*', 'site-packages'))
for python_modules in python_modules_paths:
    if os.path.exists(python_modules) and python_modules not in sys.path:
        sys.path.insert(0, python_modules)

# Import and create SkillExecutor instance for skill execution
from core.skill.executor import SkillExecutor
executor = SkillExecutor()

async def main():
    try:
${code
  .split('\n')
  .map((line) => '        ' + line)
  .join('\n')}
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False,
            "error_type": type(e).__name__
        }))

asyncio.run(main())
`;
  }

  private collectResult(process: ChildProcess): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      // Set timeout
      const timeoutTimer = setTimeout(() => {
        process.kill();
        resolve({
          exitCode: -1,
          stdout,
          stderr: 'Execution timeout',
        });
      }, 30000);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timeoutTimer);
        resolve({ exitCode: code, stdout, stderr });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutTimer);
        reject(error);
      });
    });
  }

  async cleanup(sessionId?: string): Promise<void> {
    if (sessionId) {
      const process = this.activeSessions.get(sessionId);
      if (process) {
        process.kill('SIGTERM');
        this.activeSessions.delete(sessionId);
      }
    } else {
      // Cleanup all sessions
      for (const [_id, process] of this.activeSessions) {
        process.kill('SIGTERM');
        void _id; // Mark as unused
      }
      this.activeSessions.clear();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const process = spawn(this.pythonPath, ['--version']);
      return new Promise((resolve) => {
        process.on('close', (code) => resolve(code === 0));
        process.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });
    } catch {
      return false;
    }
  }

  getInfo(): SandboxInfo {
    return {
      type: 'local',
      version: '1.0.0',
      capabilities: ['python-execution', 'skill-execution', 'file-io', 'async-support'],
    };
  }

  private async ensureWorkspace(): Promise<void> {
    try {
      await mkdir(this.workspace, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
