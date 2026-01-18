/**
 * Agent Results API Step.
 *
 * REST API endpoint for querying agent task execution results.
 * Accepts HTTP requests and returns task results from state.
 *
 * Uses safe state operations to prevent wrapObject stack overflow.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { safeStateGet } from '../../src/utils/state-safety';

/**
 * Query parameters schema for results API.
 */
export const querySchema = z.object({
  /**
   * Session ID to filter results.
   */
  sessionId: z.string().optional().describe('Filter by session ID'),

  /**
   * Limit number of results.
   */
  limit: z.string().optional().describe('Limit number of results (default: 10)'),

  /**
   * Offset for pagination.
   */
  offset: z.string().optional().describe('Offset for pagination (default: 0)'),

  /**
   * Status to filter results (completed/failed/all).
   */
  status: z.string().optional().describe('Filter by status (completed/failed)'),

  /**
   * Skills to filter results (comma-separated list).
   * Filter tasks that used any of the specified skills.
   */
  skills: z.string().optional().describe('Filter by skills (comma-separated)'),
});

/**
 * Agent Results API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-results-api',
  description: 'REST API endpoint for querying agent task results',

  /**
   * API route configuration.
   */
  path: '/agent/results',
  method: 'GET',

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
 * Agent Results API handler.
 *
 * Retrieves paginated task results from state based on query parameters.
 */
export const handler = async (request: any, { logger, state }: any) => {
  // Parse query parameters - use queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
  }

  const { sessionId, limit, offset, status, skills } = validationResult.data;
  const resultLimit = limit ? parseInt(limit, 10) : 10;
  const resultOffset = offset ? parseInt(offset, 10) : 0;
  const skillsArray = skills ? skills.split(',').map((s: string) => s.trim()) : [];

  logger.info('Agent Results API: Received query request', {
    sessionId,
    limit: resultLimit,
    offset: resultOffset,
    status,
    skills: skillsArray,
  });

  try {
    // Retrieve execution history from state with safety checks
    const groupId = 'agent:execution';
    const key = 'history';
    const history = await safeStateGet(state, groupId, key, []);

    // Filter and process results
    let results = history;

    // Filter by sessionId if provided
    if (sessionId) {
      results = results.filter((r: any) => r.sessionId === sessionId);
    }

    // Filter by status if provided
    if (status === 'completed') {
      results = results.filter((r: any) => r.success === true);
    } else if (status === 'failed') {
      results = results.filter((r: any) => r.success === false);
    }

    // Filter by skills if provided
    if (skillsArray.length > 0) {
      results = results.filter((r: any) => {
        // Check if result.skill is in the skills array
        if (r.skill && skillsArray.includes(r.skill)) {
          return true;
        }
        // Check if result.metadata.skillNames contains any of the skills
        if (r.metadata?.skillNames) {
          return r.metadata.skillNames.some((skillName: string) =>
            skillsArray.includes(skillName)
          );
        }
        return false;
      });
    }

    // Get total count before pagination
    const totalCount = results.length;

    // Apply offset and limit for pagination
    results = results.slice(resultOffset, resultOffset + resultLimit);

    return {
      status: 200,
      body: {
        success: true,
        count: results.length,
        total: totalCount,
        offset: resultOffset,
        limit: resultLimit,
        hasMore: resultOffset + resultLimit < totalCount,
        results: results.map((r: any) => {
          const result: any = {
            taskId: r.taskId,
            task: r.task,
            success: r.success,
            output: r.output,
            error: r.error,
            executionTime: r.executionTime,
            metadata: r.metadata,
            sessionId: r.sessionId,
            timestamp: r.timestamp,
          };

          // Include parsed unified format result if available
          if (r.result) {
            result.result = r.result;
          }

          return result;
        }),
      },
    };
  } catch (error: any) {
    logger.error('Agent Results API: Error retrieving results', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve task results',
        error: error.message,
      },
    };
  }
};
