/**
 * Task Token Usage API Step.
 *
 * API endpoint for fetching token usage statistics for a specific task.
 * Returns summary, breakdown, and timeline data.
 */

import { type Handlers, type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage';
import { executionTracesStream } from '../streams/execution-traces.stream';

/**
 * Task Token Usage API configuration.
 */
export const config = {
  name: 'task-token-usage-api',
  description: 'API endpoint for fetching token usage for a specific task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:taskId/token-usage' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for task token usage requests.
 */
const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Task Token Usage API handler.
 */
export const handler: Handlers<typeof config> = async (context) => {
  const taskId = context.request.pathParams.taskId;

  logger.info('Task Token Usage API: Received request', { taskId });

  try {
    // Get database connection
    const dataStore = getDataStore();
    const pool = 'getPool' in dataStore && typeof dataStore.getPool === 'function'
      ? dataStore.getPool()
      : null;

    if (!pool) {
      logger.error('Task Token Usage API: Pool not available');
      return {
        status: 500,
        body: {
          success: false,
          message: 'Database connection not available',
        },
      };
    }

    const storage = new PostgresTokenUsageStorage(pool);

    // Get task usage summary from database
    const taskUsage = await storage.getTaskUsage(taskId);

    if (!taskUsage) {
      logger.info('Task Token Usage API: Task not found in database', { taskId });
      return {
        status: 404,
        body: {
          success: false,
          message: 'Task not found or no token usage recorded yet. Token tracking may be in progress.',
        },
      };
    }

    // Get detailed timeline from execution traces
    let detailedTimeline: any[] = [];
    const groupedBySkill: Record<string, any> = {};
    const groupedByModel: Record<string, any> = {};

    try {
      const traceData = await executionTracesStream.list(taskId);
      const traces = Array.isArray(traceData) ? traceData : [traceData];

      traces.forEach((trace: any) => {
        // Token data is stored in metadata.llmResponse for llm_call stages
        const llmResponse = trace.metadata?.llmResponse;
        if (llmResponse && (llmResponse.promptTokens || llmResponse.completionTokens || llmResponse.totalTokens)) {
          // Group by skill - 'unknown' means agent is calling directly
          const skill = trace.skillName || 'Agent直接调用';
          if (!groupedBySkill[skill]) {
            groupedBySkill[skill] = {
              skillName: skill,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              llmCallsCount: 0,
            };
          }
          groupedBySkill[skill].promptTokens += llmResponse.promptTokens || 0;
          groupedBySkill[skill].completionTokens += llmResponse.completionTokens || 0;
          groupedBySkill[skill].totalTokens += llmResponse.totalTokens || 0;
          groupedBySkill[skill].llmCallsCount += 1;

          // Group by model
          const model = trace.metadata?.llmModel || 'unknown';
          if (!groupedByModel[model]) {
            groupedByModel[model] = {
              model: model,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              llmCallsCount: 0,
            };
          }
          groupedByModel[model].promptTokens += llmResponse.promptTokens || 0;
          groupedByModel[model].completionTokens += llmResponse.completionTokens || 0;
          groupedByModel[model].totalTokens += llmResponse.totalTokens || 0;
          groupedByModel[model].llmCallsCount += 1;
        }
      });

      detailedTimeline = traces
        .filter((trace: any) => trace.metadata?.llmResponse)
        .map((trace: any) => ({
          timestamp: trace.timestamp,
          skillName: trace.skillName,
          agentId: trace.agentId,
          llmUsage: {
            promptTokens: trace.metadata.llmResponse.promptTokens,
            completionTokens: trace.metadata.llmResponse.completionTokens,
            totalTokens: trace.metadata.llmResponse.totalTokens,
            model: trace.metadata.llmModel,
            provider: trace.metadata.llmProvider,
          },
        }));

      logger.info('Task Token Usage API: Retrieved detailed data', {
        taskId,
        traceCount: traces.length,
        skillsCount: Object.keys(groupedBySkill).length,
        modelsCount: Object.keys(groupedByModel).length,
      });

      return {
        status: 200,
        body: {
          success: true,
          taskId,
          summary: taskUsage,
          breakdown: {
            bySkill: Object.values(groupedBySkill),
            byModel: Object.values(groupedByModel),
          },
          timeline: detailedTimeline,
        },
      };
    } catch (traceError: any) {
      logger.warn('Task Token Usage API: Failed to fetch traces', {
        taskId,
        error: traceError.message,
      });

      // Return database data even if traces fail
      return {
        status: 200,
        body: {
          success: true,
          taskId,
          summary: taskUsage,
          breakdown: {
            bySkill: [],
            byModel: [],
          },
          timeline: [],
        },
      };
    }
  } catch (error: any) {
    logger.error('Task Token Usage API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch task token usage',
        error: error.message,
      },
    };
  }
};
