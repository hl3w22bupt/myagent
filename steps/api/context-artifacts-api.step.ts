import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';

export const config: APIConfig = {
  type: 'api',
  name: 'context-artifacts-api',
  path: '/api/contexts/:id/artifacts',
  method: 'GET',
  emits: [],
};

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const contextStore = getContextStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(request.params.id);
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

    // 获取Artifacts
    const artifacts = await contextStore.getArtifacts(taskId);

    logger.info('Artifacts retrieved', {
      taskId,
      artifactCount: artifacts.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: artifacts,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve artifacts', {
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
