import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { ContextManager } from '../../src/core/context/manager';
import { getDataStore } from '../../src/core/database/data-store';

const contextManager = new ContextManager(getDataStore());

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'context-skill-execution-api',
  description: 'REST API endpoint for recording skill executions',

  path: '/api/context/skill-execution',
  method: 'POST',

  emits: [],
  virtualSubscribes: [],
  flows: [],

  bodySchema: z.object({
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

export const handler = async (request: any, { logger }: any) => {
  try {
    const body = schema.parse(request.body || {});

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
