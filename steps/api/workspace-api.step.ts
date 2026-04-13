import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, normalize } from 'path';
import { homedir } from 'os';
import { getDataStore } from '../../src/core/database/data-store';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'workspace-api',
  path: '/api/workspace/:taskId',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  modifiedTime: string;
  relativePath: string;
}

/**
 * 递归获取目录下的所有文件
 */
function getFilesRecursively(dirPath: string, baseDir: string, maxDepth = 10, currentDepth = 0): FileInfo[] {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const files: FileInfo[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = fullPath.replace(baseDir + '/', '');

      if (entry.isDirectory()) {
        files.push({
          name: entry.name,
          path: fullPath,
          size: 0,
          type: 'directory',
          modifiedTime: statSync(fullPath).mtime.toISOString(),
          relativePath,
        });

        // 递归获取子目录内容
        try {
          const subFiles = getFilesRecursively(fullPath, baseDir, maxDepth, currentDepth + 1);
          files.push(...subFiles);
        } catch (error) {
          // 忽略无法访问的子目录
          console.warn(`Failed to read subdirectory: ${fullPath}`, error);
        }
      } else if (entry.isFile()) {
        const stats = statSync(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          size: stats.size,
          type: 'file',
          modifiedTime: stats.mtime.toISOString(),
          relativePath,
        });
      }
    }
  } catch (error) {
    console.error(`Failed to read directory: ${dirPath}`, error);
  }

  return files;
}

/**
 * 验证路径是否在允许的范围内
 * 防止路径遍历攻击
 */
function validatePath(workspace: string): boolean {
  // Expand tilde to home directory
  const expanded = workspace.startsWith('~/')
    ? join(homedir(), workspace.slice(2))
    : workspace === '~' ? homedir() : workspace;

  // 只允许已知的安全目录前缀
  const allowedPrefixes = [
    '/tmp/myagent-workspace',   // 统一默认 workspace
    '/tmp/',                     // 其他 /tmp 下的路径（含用户指定 workspace）
    '/Users/leo/workspace',
    join(homedir(), '.myrd'),    // myrd workspace
  ];

  // 规范化路径
  const normalized = normalize(expanded);

  // 检查是否以允许的前缀开头
  return allowedPrefixes.some(prefix => normalized.startsWith(prefix));
}

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    // 验证 taskId
    const validationResult = taskIdSchema.safeParse(request.pathParams.taskId);
    if (!validationResult.success) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Invalid taskId format',
        },
      };
    }
    const taskId = validationResult.data;

    // 获取任务信息以获取 workspace
    const store = getDataStore();
    const task = await store.getTask(taskId);

    if (!task) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Task not found',
        },
      };
    }

    // 从 task metadata 获取 workspace（支持多种来源）
    // 优先级：workflow 更新后的 workspace > 原始传入的 workspace
    // 1. variables.workflowWorkspace（Workflow git-clone 更新后的实际工作目录）
    // 2. 顶层 metadata.workspace（直接 Agent 任务）
    // 3. metadata.environment.workspace（通过 environment 传入的原始值）
    const workspace =
      task.metadata?.variables?.workflowWorkspace ||
      (task.metadata?.variables?.variables as any)?.workflowWorkspace ||
      task.metadata?.workspace ||
      task.metadata?.environment?.workspace;

    // Expand tilde in workspace path
    const expandedWorkspace = workspace.startsWith('~/')
      ? join(homedir(), workspace.slice(2))
      : workspace === '~' ? homedir() : workspace;

    if (!expandedWorkspace) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Task does not have a workspace',
        },
      };
    }

    // 验证路径安全性
    if (!validatePath(expandedWorkspace)) {
      logger.warn('Invalid workspace path', { workspace: expandedWorkspace, taskId });
      return {
        status: 403,
        body: {
          success: false,
          error: 'Invalid workspace path',
        },
      };
    }

    // 检查 workspace 是否存在
    if (!existsSync(expandedWorkspace)) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Workspace directory not found',
          data: {
            workspace: expandedWorkspace,
            exists: false,
          },
        },
      };
    }

    // 获取文件列表
    const files = getFilesRecursively(expandedWorkspace, expandedWorkspace, 5, 0);

    // 统计信息
    const fileCount = files.filter(f => f.type === 'file').length;
    const dirCount = files.filter(f => f.type === 'directory').length;
    const totalSize = files.reduce((sum, f) => sum + (f.type === 'file' ? f.size : 0), 0);

    logger.info('Workspace files retrieved', {
      taskId,
      workspace: expandedWorkspace,
      fileCount,
      dirCount,
      totalSize,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          taskId,
          workspace: expandedWorkspace,
          files,
          summary: {
            fileCount,
            dirCount,
            totalSize,
          },
        },
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve workspace files', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    };
  }
};
