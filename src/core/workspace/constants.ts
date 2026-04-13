/**
 * Workspace 常量和辅助函数
 *
 * 定义统一的 workspace 标准和路径规则
 */

/**
 * 默认 workspace 根目录
 *
 * 所有未指定 workspace 的任务将使用此目录
 * 路径格式: /tmp/myagent-workspace/{taskId}/
 */
export const DEFAULT_WORKSPACE_ROOT = '/tmp/myagent-workspace';

/**
 * 获取默认 workspace 路径（绝对路径）
 *
 * 按 sessionId 确定路径，同一 session 内所有 task 共享 workspace。
 * 如果没有 sessionId，回退到 taskId。
 *
 * @param id - sessionId 或 taskId
 * @returns 绝对路径，格式为 /tmp/myagent-workspace/{id}/
 *
 * @example
 * ```typescript
 * getDefaultWorkspace('session-123'); // '/tmp/myagent-workspace/session-123'
 * ```
 */
export function getDefaultWorkspace(id: string): string {
  if (!id) {
    throw new Error('id (sessionId or taskId) is required for getDefaultWorkspace');
  }
  return `${DEFAULT_WORKSPACE_ROOT}/${id}`;
}

/**
 * 判断是否为默认 workspace
 *
 * @param workspace - workspace 路径
 * @returns 是否为默认 workspace（即 /tmp/myagent-workspace 开头）
 *
 * @example
 * ```typescript
 * isDefaultWorkspace('/tmp/myagent-workspace/task-123'); // true
 * isDefaultWorkspace('/Users/leo/project'); // false
 * ```
 */
export function isDefaultWorkspace(workspace: string): boolean {
  return workspace.startsWith(DEFAULT_WORKSPACE_ROOT);
}

/**
 * Workspace 优先级解析
 *
 * 按优先级获取 workspace：
 * 1. context.environment.workspace（最高优先级）
 * 2. context.environment.workingDirectory（向后兼容）
 * 3. Agent 配置的 workingDirectory（Agent 默认值）
 * 4. /tmp/myagent-workspace/{taskId}/（系统默认）
 *
 * @param context - Agent 或 task 执行上下文
 * @param taskId - 任务 ID
 * @param agentConfigWorkingDir - Agent 配置的 workingDirectory（可选，已废弃）
 * @returns workspace 路径（绝对路径）
 */
export function resolveWorkspace(
  context: any,
  taskId: string,
  agentConfigWorkingDir?: string
): string {
  // 1. context.environment.workspace（最高优先级）
  if (context?.environment?.workspace) {
    return context.environment.workspace;
  }

  // 2. context.environment.workingDirectory（向后兼容）
  if (context?.environment?.workingDirectory) {
    return context.environment.workingDirectory;
  }

  // 3. Agent 配置的 workingDirectory（已废弃，保留向后兼容）
  if (agentConfigWorkingDir) {
    return agentConfigWorkingDir;
  }

  // 4. 系统默认
  return getDefaultWorkspace(taskId);
}
