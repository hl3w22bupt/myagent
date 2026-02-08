/**
 * Agent Tasks Delete API Step.
 *
 * REST API endpoint for deleting agent task execution results.
 * Supports both single and batch deletion through the same endpoint.
 *
 * RESTful Design:
 * - DELETE /agent/results?id=single-id     -> Delete single task
 * - DELETE /agent/results?ids=id1,id2,id3  -> Delete multiple tasks
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Query parameters schema for delete API.
 * Supports both 'id' (single) and 'ids' (batch) parameters.
 */
export const querySchema = z
  .object({
    /**
     * Single task ID to delete (optional, mutually exclusive with 'ids').
     */
    id: z.string().optional().describe('Single task ID to delete'),

    /**
     * Multiple task IDs to delete (optional, mutually exclusive with 'id').
     */
    ids: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        if (Array.isArray(val)) return val;
        // Split by comma and trim each ID
        return val.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
      })
      .describe('Multiple task IDs to delete (comma-separated)'),
  })
  .refine(
    (data) => {
      // Either 'id' or 'ids' must be provided, but not both
      const hasId = data.id && data.id.length > 0;
      const hasIds = data.ids && data.ids.length > 0;
      return hasId !== hasIds; // XOR: exactly one should be true
    },
    {
      message: 'Provide either "id" for single deletion or "ids" for batch deletion, not both',
    }
  )
  .transform((data) => {
    // Normalize to always use 'ids' array
    if (data.id) {
      return { ids: [data.id] };
    }
    // Validate batch size limit
    if (data.ids && data.ids.length > 100) {
      throw new Error('Cannot delete more than 100 tasks at once');
    }
    return { ids: data.ids || [] };
  })
  .pipe(
    z.object({
      ids: z.array(z.string()).min(1, 'At least one task ID is required').describe('Task IDs to delete'),
    })
  );

/**
 * Agent Tasks Delete API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-tasks-delete-api',
  description: 'REST API endpoint for deleting agent task results (single or batch)',

  /**
   * API route configuration.
   * Uses DELETE method on /agent/results to follow RESTful conventions.
   */
  path: '/agent/results',
  method: 'DELETE',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Agent Tasks Delete API handler.
 *
 * Deletes single or multiple task results from database.
 * - Single deletion: DELETE /agent/results?id=task-id
 * - Batch deletion: DELETE /agent/results?ids=id1,id2,id3
 *
 * Returns detailed results including successful and failed deletions.
 */
export const handler = async (request: any, { logger }: any) => {
  // Parse query parameters
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    return {
      status: 400,
      body: {
        success: false,
        message: `Invalid query parameters: ${validationResult.error.message}`,
      },
    };
  }

  const { ids } = validationResult.data;
  const isBatch = ids.length > 1;

  logger.info('Agent Tasks Delete API: Received delete request', {
    type: isBatch ? 'batch' : 'single',
    taskCount: ids.length,
    taskIds: ids,
  });

  const results = {
    successful: [] as Array<{ taskId: string; task: string; timestamp: string }>,
    failed: [] as Array<{ taskId: string; error: string }>,
    totalRequested: ids.length,
  };

  try {
    // Get database store
    const unifiedStore = getDataStore();

    // Step 1: Query all tasks to get details before deletion
    const tasksToDelete = await Promise.all(
      ids.map(async (taskId) => {
        const task = await unifiedStore.getTask(taskId);
        return { taskId, task };
      })
    );

    // Separate found and not-found tasks
    const foundTasks = tasksToDelete.filter(({ task }) => task !== null);
    const notFoundIds = tasksToDelete.filter(({ task }) => task === null).map(({ taskId }) => taskId);

    // Add not-found tasks to failed results
    for (const taskId of notFoundIds) {
      results.failed.push({
        taskId,
        error: 'Task not found',
      });
    }

    // Step 2: Batch delete all found tasks using single SQL DELETE statement
    // This is atomic and avoids PostgreSQL deadlock
    if (foundTasks.length > 0) {
      const foundTaskIds = foundTasks.map(({ task }) => task!.id);
      const deletedCount = await unifiedStore.deleteTasks(foundTaskIds);

      logger.info('Agent Tasks Delete API: Batch delete completed', {
        requested: foundTaskIds.length,
        deleted: deletedCount,
      });

      // All found tasks should be deleted successfully
      for (const { task } of foundTasks) {
        if (task) {
          results.successful.push({
            taskId: task.id,
            task: task.task,
            timestamp: task.createdAt.toISOString(),
          });

          logger.info('Agent Tasks Delete API: Task deleted successfully', {
            taskId: task.id,
          });
        }
      }
    }

    // Determine overall success
    const hasSuccess = results.successful.length > 0;
    const hasFailures = results.failed.length > 0;

    // Return appropriate status code and message
    const statusCode = hasFailures && !hasSuccess ? 500 : 200;

    // Build success message
    let message;
    if (isBatch) {
      message = `Deleted ${results.successful.length} of ${ids.length} tasks`;
      if (hasFailures) {
        message += ` (${results.failed.length} failed)`;
      }
    } else {
      message = hasSuccess
        ? 'Task deleted successfully'
        : 'Failed to delete task';
    }

    return {
      status: statusCode,
      body: {
        success: hasFailures && !hasSuccess ? false : true,
        message,
        type: isBatch ? 'batch' : 'single',
        summary: {
          totalRequested: results.totalRequested,
          successfulCount: results.successful.length,
          failedCount: results.failed.length,
        },
        results: hasSuccess || hasFailures ? {
          successful: results.successful,
          failed: results.failed,
        } : undefined,
      },
    };
  } catch (error: any) {
    logger.error('Agent Tasks Delete API: Unexpected error during delete operation', {
      error: error.message,
      stack: error.stack,
      taskCount: ids.length,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to delete task(s)',
        error: error.message,
      },
    };
  }
};
