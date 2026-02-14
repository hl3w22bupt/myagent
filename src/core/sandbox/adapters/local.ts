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
import { existsSync } from 'fs';
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
    // Default to venv python for dependency isolation
    const venvPython = join(process.cwd(), 'python_modules', 'bin', 'python3');
    this.pythonPath = config.pythonPath || (existsSync(venvPython) ? venvPython : 'python3');
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
      // Default to project root for shared library access, or use skillImplPath if provided
      const projectRoot = process.cwd();
      const skillPath = options.skillImplPath || projectRoot;

      // Determine if pythonPath is in a venv
      const venvMatch = this.pythonPath.match(/^(.+\/venv\/)bin\/python3$/);
      const pythonPaths = [skillPath];

      if (venvMatch) {
        // Add venv site-packages to path
        const venvPath = venvMatch[1];
        const sitePackages = join(venvPath, 'lib', 'python3.11', 'site-packages');
        pythonPaths.push(sitePackages);
      } else {
        // Add python_modules site-packages for non-venv Python
        // Search upward from skillPath to find python_modules
        let searchPath = skillPath;
        let foundSitePackages = false;

        // Search up to 5 levels upward
        for (let i = 0; i < 5 && !foundSitePackages; i++) {
          // Check python3.11, python3.12, python3.13, and python3.14
          const sitePackagesPaths = ['3.11', '3.12', '3.13', '3.14'].map(ver =>
            join(searchPath, 'python_modules', 'lib', `python${ver}`, 'site-packages')
          );

          for (const sitePackages of sitePackagesPaths) {
            if (existsSync(sitePackages)) {
              pythonPaths.push(sitePackages);
              foundSitePackages = true;
              break;
            }
          }

          // Move up one directory
          searchPath = join(searchPath, '..');
        }
      }

      const pythonPathEnv = pythonPaths.join(':');
      const srcPath = join(projectRoot, 'src');
      pythonPaths.push(srcPath);

      const childProcess = spawn(this.pythonPath, [scriptPath], {
        env: {
          ...process.env,
          MOTIA_TRACE_ID: options.metadata?.traceId || sessionId,
          MOTIA_TASK_ID: options.metadata?.taskId || '',
          MOTIA_SKILL_PATH: skillPath,
          MOTIA_NOTIFY_API_URL: 'http://localhost:3000/api/notify',
          MOTIA_TRACE_API_URL: 'http://localhost:3000/api/traces/submit',
          MOTIA_SESSION_ID: options.sessionId,
          PYTHONPATH: pythonPathEnv,
          ...options.env,
        },
        timeout: options.timeout || 300000, // 5 minutes default for video rendering
      });

      this.activeSessions.set(sessionId, childProcess);

      // 4. Collect output
      const timeout = options.timeout || 300000;
      const result = await this.collectResult(childProcess, timeout);

      // 5. Save script for debugging and log path
      const debugPath = join(this.workspace, `debug_${sessionId}.py`);
      await writeFile(debugPath, wrappedCode, 'utf-8')
        .then(() => {
          if (result.exitCode === 0) {
            console.log(`[Sandbox] Script saved to: ${debugPath}`);
          } else {
            console.error(`[Sandbox] Failed script saved to: ${debugPath}`);
          }
        })
        .catch(() => {});

      // Cleanup temporary script
      await unlink(scriptPath).catch(() => {});

      // DEBUG: Log execution result details BEFORE deleting session
      console.log('[Sandbox] Execution result:', {
        sessionId,
        exitCode: result.exitCode,
        stdoutLength: result.stdout?.length || 0,
        stderrLength: result.stderr?.length || 0,
        hasStdout: !!result.stdout,
        hasStderr: !!result.stderr,
        stdoutPreview: result.stdout?.substring(0, 500),
        stderrPreview: result.stderr?.substring(0, 500),
      });

      // If execution failed, log full stderr for debugging
      if (result.exitCode !== 0) {
        console.error('[Sandbox] Execution FAILED - Full stderr:', {
          sessionId,
          exitCode: result.exitCode,
          stderr: result.stderr,
          stdout: result.stdout,
        });
      }

      this.activeSessions.delete(sessionId);

      const executionTime = Date.now() - startTime;

      // ============ 新增：读取结构化输出文件 ============
      let structuredOutput: any = undefined;

      try {
        // 从 stdout 中提取 [STRUCTURED_OUTPUT] 标记
        const outputMatch = result.stdout.match(/\[STRUCTURED_OUTPUT\]\s+(.+?)(?:\n|$)/);

        console.log('[Sandbox] Looking for [STRUCTURED_OUTPUT] marker in stdout...');
        console.log('[Sandbox] stdout length:', result.stdout?.length);
        console.log('[Sandbox] stdout preview:', result.stdout?.substring(0, 500));

        if (outputMatch && outputMatch[1]) {
          const outputFile = outputMatch[1].trim();
          console.log('[Sandbox] Found [STRUCTURED_OUTPUT] marker, file:', outputFile);

          // 读取 JSON 文件
          const { existsSync } = await import('fs');
          const { readFile } = await import('fs/promises');

          if (existsSync(outputFile)) {
            const jsonContent = await readFile(outputFile, 'utf-8');
            structuredOutput = JSON.parse(jsonContent);

            console.log('[Sandbox] ✅ Successfully read structured output file:', {
              sessionId: options.sessionId,
              resultType: structuredOutput?.result_type,
              outputFile
            });
            console.log('[Sandbox] structuredOutput data:', JSON.stringify(structuredOutput, null, 2));
          } else {
            console.warn('[Sandbox] ❌ File does not exist:', outputFile);
          }
        } else {
          console.warn('[Sandbox] ❌ No [STRUCTURED_OUTPUT] marker found in stdout');
        }
      } catch (error) {
        console.warn('[Sandbox] ❌ Failed to read structured output:', error);
      }
      // ====================================================

      // Check for unified format result in stdout
      // Skills may return structured results like: output={'success': False, ...}
      // even when exiting cleanly (exitCode=0). We need to detect this.
      let success = result.exitCode === 0;
      let errorMessage = result.stderr || undefined;

      if (result.stdout) {
        try {
          // Look for Python dict pattern: output={...}
          const outputMatch = result.stdout.indexOf('output={');
          if (outputMatch !== -1) {
            // Find the complete dict by counting braces
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            let dictEnd = -1;

            for (let i = outputMatch + 7; i < result.stdout.length; i++) {
              const char = result.stdout[i];

              if (escapeNext) {
                escapeNext = false;
                continue;
              }

              if (char === '\\') {
                escapeNext = true;
                continue;
              }

              if (char === "'" && !escapeNext) {
                inString = !inString;
                continue;
              }

              if (!inString) {
                if (char === '{') {
                  braceCount++;
                } else if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    dictEnd = i;
                    break;
                  }
                }
              }
            }

            if (dictEnd !== -1) {
              // Extract the dict string
              const dictStr = result.stdout.substring(outputMatch + 7, dictEnd + 1);

              // Convert Python syntax to JSON
              const jsonStr = dictStr
                .replace(/'/g, '"')  // Python single quotes to JSON double quotes
                .replace(/True/g, 'true')  // Python True to JSON true
                .replace(/False/g, 'false')  // Python False to JSON false
                .replace(/None/g, 'null');  // Python None to JSON null

              // Parse as JSON
              const structuredResult = JSON.parse(jsonStr);

              // Override success if structured result has success field
              if (typeof structuredResult.success === 'boolean') {
                const originalSuccess = success;
                success = structuredResult.success;

                // Extract error message if available
                if (!success && structuredResult.content && structuredResult.content.message) {
                  errorMessage = structuredResult.content.message;
                }

                // Log if status was overridden
                if (originalSuccess !== success) {
                  console.log('[Sandbox] Success status overridden by unified format result', {
                    sessionId,
                    originalSuccess,
                    overriddenSuccess: success,
                    resultType: structuredResult.result_type,
                  });
                }
              }
            }
          }
        } catch (error) {
          // Failed to parse unified format, ignore and use exitCode
          console.warn('[Sandbox] Failed to parse unified format result', {
            sessionId,
            error: (error as Error).message,
          });
        }
      }

      return {
        success,
        output: result.stdout,
        error: !success
          ? {
              type: 'execution',
              message: errorMessage || 'Unknown error',
            }
          : undefined,
        executionTime,
        sessionId,
        stdout: result.stdout,
        stderr: result.stderr,
        structuredOutput,  // 新增：结构化输出
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
    // Normalize code indentation while preserving relative indentation:
    // 1. Split into lines
    // 2. Find minimum indentation (excluding empty lines)
    // 3. Remove that minimum indentation from all lines
    // 4. Add consistent 8-space indentation
    const lines = code.split('\n');

    // Find minimum indentation (number of leading spaces/tabs)
    const minIndent = lines
      .filter((line) => line.trim().length > 0) // Skip empty lines
      .reduce((min, line) => {
        const match = line.match(/^(\s*)/);
        const indent = match ? match[1].length : 0;
        return Math.min(min, indent);
      }, Infinity);

    // Remove minimum indentation from all lines
    const dedentedLines = lines.map((line) => {
      if (line.trim().length === 0) return line; // Keep empty lines as-is
      return line.substring(minIndent);
    });

    // Filter out LLM-generated SkillExecutor initialization to avoid overriding template
    const filteredLines = dedentedLines.filter((line) => {
      const trimmed = line.trim();
      // Remove simple "executor = SkillExecutor()" without parameters
      // But keep "executor = SkillExecutor(notify_hook_api_url=...)" from template
      if (trimmed.includes('executor') && trimmed.includes('=') && trimmed.includes('SkillExecutor')) {
        // Check if it has function parameters (anything between parentheses after SkillExecutor)
        const match = trimmed.match(/SkillExecutor\s*\(([^)]*)\)/);
        if (match && match[1].trim() !== '') {
          // Has parameters - this is from template, keep it
          return true;
        }
        // No parameters - this is LLM-generated, filter it out
        return false;
      }
      // Keep all other lines (including notify_hook_api_url from template)
      return true;
    });

    // Ensure there's at least some content
    if (filteredLines.length === 0 || filteredLines.every((l) => l.trim() === '')) {
      throw new Error('Generated code is empty or contains only whitespace');
    }

    // Add consistent 8-space indent to all lines
    const normalizedCode = filteredLines
      .map((line) => '        ' + line)
      .join('\n');

    // Always include SkillExecutor and retry_utils (needed for progress notifications)
    const skillExecutorImports = `
# Import and create SkillExecutor instance for skill execution
from core.skill.executor import SkillExecutor
from core.sandbox.retry_utils import execute_with_retry

# Import virtual skill registry for Claude Skills
from core.skill.adapters.virtual_skill_registry import create_virtual_registry

# Get notify API URL from environment (set by LocalSandboxAdapter)
# This enables automatic hook registration for progress notifications
notify_hook_api_url = os.getenv('MOTIA_NOTIFY_API_URL')
task_id = os.getenv('MOTIA_TASK_ID')  # Task ID for tracking and file naming

# Create virtual registry for Claude Skills (async initialization happens in SkillExecutor)
# Note: Virtual registry will be scanned automatically when needed
import asyncio
virtual_registry = asyncio.run(create_virtual_registry())

# Create SkillExecutor with virtual registry support
executor = SkillExecutor(notify_hook_api_url=notify_hook_api_url, virtual_registry=virtual_registry)
`;

    return `
import asyncio
import sys
import os
import json

# 新增：创建结构化输出目录
STRUCTURED_OUTPUT_DIR = '/tmp/motia-sandbox/structured_outputs'
os.makedirs(STRUCTURED_OUTPUT_DIR, exist_ok=True)

# Add skill path to Python path
skill_path = os.getenv('MOTIA_SKILL_PATH', '${options.skillImplPath || ''}')
if skill_path and skill_path not in sys.path:
    sys.path.insert(0, skill_path)

# Also add src/ directory to path for importing core modules
src_path = os.path.join(skill_path if skill_path else '.', 'src')
if os.path.exists(src_path) and src_path not in sys.path:
    sys.path.insert(0, src_path)

# Also add skills/lib directory for OutputBuilder and shared utilities
skills_lib_path = os.path.join(skill_path if skill_path else '.', 'skills', 'lib')
if os.path.exists(skills_lib_path) and skills_lib_path not in sys.path:
    sys.path.insert(0, skills_lib_path)

# Also add python_modules to path (try both python3.11 and python3.13)
import glob
python_modules_paths = glob.glob(os.path.join(skill_path if skill_path else '.', 'python_modules', 'lib', 'python3.*', 'site-packages'))
for python_modules in python_modules_paths:
    if os.path.exists(python_modules) and python_modules not in sys.path:
        sys.path.insert(0, python_modules)
${skillExecutorImports}
async def main():
    try:
${normalizedCode}
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False,
            "error_type": type(e).__name__
        }))

asyncio.run(main())
`;
  }

  private collectResult(process: ChildProcess, timeout: number): Promise<{
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
      }, timeout);

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
