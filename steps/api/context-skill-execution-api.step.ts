import { z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { ContextManager } from '../../src/core/context/manager.js';
import { getDataStore } from '../../src/core/database/data-store.js';

export const config = {
  name: 'context-skill-execution-api',
  description: 'REST API endpoint for recording skill executions',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/context/skill-execution' }],

  enqueues: [] as const,
} as const satisfies StepConfig;

const schema = z.object({
  taskId: z.string(),
  skillName: z.string(),
  success: z.boolean(),
  startedAt: z.string(),
  completedAt: z.string(),
  duration: z.number(),
  inputSummary: z.string(),
  outputType: z.string().optional(),
  scenario: z.string().optional(),
  error: z.string().optional(),
});

export const handler: any = async (context: any) => {
  try {
    const body = schema.parse(context.request.body || {});

    // 使用 ContextManager 添加执行记录
    const dataStore = getDataStore();
    await dataStore.initialize();
    const contextManager = new ContextManager(dataStore);
    await contextManager.addSkillExecution({
      id: `${body.taskId}-${body.skillName}-${Date.now()}`,
      taskId: body.taskId,
      skillName: body.skillName,
      success: body.success,
      startedAt: new Date(body.startedAt),
      completedAt: new Date(body.completedAt),
      duration: body.duration,
      inputSummary: body.inputSummary,
      outputType: body.outputType,
      scenario: body.scenario,
      error: body.error,
    });

    logger.info('Skill execution recorded', {
      taskId: body.taskId,
      skillName: body.skillName,
      success: body.success,
      duration: body.duration,
    });

    return { status: 200, body: { success: true } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid skill execution payload', {
        errors: error.issues,
      });
      return { status: 400, body: { error: 'Invalid request payload', details: error.issues } };
    }

    logger.error('Failed to record skill execution', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { status: 500, body: { error: 'Internal server error' } };
  }
};
