import { z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { ContextManager } from '../../src/core/context/manager.js';
import { getDataStore } from '../../src/core/database/data-store.js';

export const config = {
  name: 'context-tool-usage-api',
  description: 'REST API endpoint for recording tool usage',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/context/tool-usage' }],

  enqueues: [] as const,
} as const satisfies StepConfig;

const schema = z.object({
  taskId: z.string(),
  toolName: z.string(),
  success: z.boolean(),
  timestamp: z.string(),
  summary: z.string(),
  error: z.string().optional(),
});

export const handler: any = async (context: any) => {
  try {
    const body = schema.parse(context.request.body || {});

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
