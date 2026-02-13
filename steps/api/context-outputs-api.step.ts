import { ApiRouteConfig } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'context-outputs-api',
  description: 'API endpoint for fetching multi-round outputs for a task',
  path: '/api/contexts/:id/outputs',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(request.pathParams.id);
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

    // Get outputs for this task
    const outputs = await unifiedStore.getOutputs(taskId);

    logger.info('Outputs retrieved', {
      taskId,
      outputCount: outputs.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: outputs,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve outputs', {
      error: (error as Error).message,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
