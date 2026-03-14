import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { ContextManager } from '../../src/core/context/manager';
import { getDataStore } from '../../src/core/database/data-store';

const contextManager = new ContextManager(getDataStore());

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'context-tool-usage-api',
  description: 'REST API endpoint for recording tool usage',

  path: '/api/context/tool-usage',
  method: 'POST',

  emits: [],
  virtualSubscribes: [],
  flows: [],

  bodySchema: z.object({
    taskId: z.string(),
    toolName: z.string(),
    success: z.boolean(),
    timestamp: z.string(),
    summary: z.string(),
    error: z.string().optional(),
  }),

  responseSchema: {
    200: z.object({
      success: z.boolean(),
    }),
    400: z.object({
      error: z.string(),
      details: z.array(z.any()).optional(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
};

const schema = z.object({
  taskId: z.string(),
  toolName: z.string(),
  success: z.boolean(),
  timestamp: z.string(),
  summary: z.string(),
  error: z.string().optional(),
});

export const handler = async (request: any, { logger }: any) => {
  try {
    const body = schema.parse(request.body || {});

    const dataStore = getDataStore();
    await dataStore.initialize();
    const contextManager = new ContextManager(dataStore);
    await contextManager.addToolUsage({
      id: `${body.taskId}-${body.toolName}-${Date.now()}`,
      taskId: body.taskId,
      toolName: body.toolName,
      success: body.success,
      timestamp: new Date(body.timestamp),
      summary: body.summary,
      error: body.error,
    });

    logger.info('Tool usage recorded', {
      taskId: body.taskId,
      toolName: body.toolName,
      success: body.success,
    });

    return { status: 200, body: { success: true } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid tool usage payload', {
        errors: error.issues,
      });
      return { status: 400, body: { error: 'Invalid request payload', details: error.issues } };
    }

    logger.error('Failed to record tool usage', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { status: 500, body: { error: 'Internal server error' } };
  }
};
