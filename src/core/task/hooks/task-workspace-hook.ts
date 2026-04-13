/**
 * Task Workspace Hook
 *
 * Manages task-level workspace lifecycle:
 * - Pre-exec: No action needed (skills create their own subdirectories)
 * - Post-exec: Cleanup entire task workspace directory after all skills complete
 *
 * This allows skills to share files during task execution while ensuring cleanup at the end.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseTaskHook } from './base';
import { TaskContext } from './types';
import { DEFAULT_WORKSPACE_ROOT } from '../../workspace/constants';

const WORKSPACE_ROOT = DEFAULT_WORKSPACE_ROOT;

/**
 * Task-level workspace management hook.
 *
 * Responsibilities:
 * - Ensures workspace root directory exists
 * - Cleans up entire task workspace directory after task completion
 * - This allows skills to maintain subdirectories during task execution
 */
export class TaskWorkspaceHook extends BaseTaskHook {
  /**
   * Called before task execution starts
   *
   * @param context - Task execution context
   */
  async preExec(context: TaskContext): Promise<void> {
    const { taskId, services } = context;

    // Ensure workspace root exists
    if (!fs.existsSync(WORKSPACE_ROOT)) {
      fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
    }

    // Create task-specific workspace directory
    const taskDir = path.join(WORKSPACE_ROOT, taskId);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    services.logger.info('[TaskWorkspaceHook] Workspace ready', {
      taskId,
      workspaceRoot: WORKSPACE_ROOT,
      taskDir,
    });
  }

  /**
   * Called after task execution completes (success or failure)
   *
   * @param context - Task execution context
   * @param result - Task execution result
   */
  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    try {
      // 从 result.metadata.workspace 获取实际使用的 workspace
      const actualWorkspace = result?.metadata?.workspace;
      const taskDir = actualWorkspace || path.join(WORKSPACE_ROOT, taskId);

      // 只有默认 workspace（/tmp/myagent-workspace/...）才自动清理
      // 用户指定的 workspace 不清理
      const isDefault = taskDir.startsWith(DEFAULT_WORKSPACE_ROOT);
      if (!isDefault) {
        services.logger.info('[TaskWorkspaceHook] Preserving user-specified workspace', { taskId, taskDir });
        return;
      }

      if (fs.existsSync(taskDir)) {
        fs.rmSync(taskDir, { recursive: true, force: true });
        services.logger.info('[TaskWorkspaceHook] Task workspace cleaned', { taskId, taskDir });
      } else {
        services.logger.debug('[TaskWorkspaceHook] No workspace to clean', { taskId });
      }
    } catch (error) {
      services.logger.error('[TaskWorkspaceHook] Failed to cleanup workspace', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
