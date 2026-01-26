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

const contextStore = getContextStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const taskId = request.params.id;

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
