import { type StepConfig, logger } from 'motia';
import { z } from 'zod';
import { getDataStore } from '../../src/core/database/data-store';

export const config = {
  name: 'context-artifacts-api',
  description: 'API endpoint for fetching artifacts for a task',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/contexts/:id/artifacts' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

const taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

const unifiedStore = getDataStore();

export const handler: any = async (context: any) => {
  try {
    // Validate taskId
    const validationResult = taskIdSchema.safeParse(context.request.pathParams.id);
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
    const artifacts = await unifiedStore.getArtifacts(taskId);

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
