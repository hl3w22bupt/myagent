import { BaseTaskHook, TaskContext, PreExecResult } from './base';

/**
 * User Allow TaskHook
 * Checks if user is allowed to execute the task based on required skills/subagents
 *
 * Permission logic:
 * - Analyze task to determine which skills/subagents will be needed
 * - Check if user has permission for all required skills/subagents
 * - If any required skill/subagent is NOT allowed, reject the task
 *
 * NOTE: This is a simple placeholder implementation.
 * Initial version: Allow all tasks (no permission checking)
 * Future version: Implement actual permission validation
 */
export class UserAllowTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): PreExecResult {
    const { task, services, metadata } = context;
    const userId = metadata?.userId;

    // TODO: Implement actual permission checking
    // Future implementation should:
    // 1. Analyze task to identify required skills/subagents
    // 2. Query user permissions for each required skill/subagent
    // 3. If any required skill/subagent is not allowed, return {stop: true, reason: '...'}
    //
    // Example future implementation:
    // const requiredSkills = await analyzeRequiredSkills(task);
    // const userPermissions = await getUserPermissions(userId);
    // const hasAllPermissions = requiredSkills.every(skill => userPermissions.allowedSkills.includes(skill));
    // if (!hasAllPermissions) {
    //   return { stop: true, reason: 'User lacks permission for required skills' };
    // }

    // Current implementation: Allow all tasks (no permission checking)
    if (!userId) {
      services.logger.warn('No userId in task metadata', { taskId: context.taskId });
      // Don't block, just warn
    }

    services.logger.debug('User allow check passed (allow-all mode)', { userId, task });
    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // No cleanup needed for permission checking
  }
}
