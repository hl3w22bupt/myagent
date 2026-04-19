import { z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { ContextManager } from '../../src/core/context/manager';
import { getDataStore } from '../../src/core/database/data-store';

export const config = {
  name: 'context-failure-experience-api',
  description: 'REST API endpoint for recording failure experiences',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/context/failure-experience' }],

  enqueues: [] as const,
} as const satisfies StepConfig;

const schema = z.object({
  taskId: z.string(),
  skillName: z.string(),
  error: z.string(),
  scenario: z.string(),
  solution: z.string(),
  timestamp: z.string(),
});

export const handler: any = async (context: any) => {
  try {
    const body = schema.parse(context.request.body || {});

    const dataStore = getDataStore();
    await dataStore.initialize();
    const contextManager = new ContextManager(dataStore);

    // 验证 timestamp 格式
    let timestamp: Date;
    try {
      timestamp = new Date(body.timestamp);
      if (isNaN(timestamp.getTime())) {
        throw new Error('Invalid timestamp format');
      }
    } catch {
      logger.warn('Invalid timestamp in failure experience', {
        timestamp: body.timestamp,
        taskId: body.taskId,
      });
      timestamp = new Date(); // 使用当前时间作为后备
    }

    await contextManager.addFailureExperience(
      body.taskId,
      {
        error: `${body.skillName}: ${body.error}`,
        solution: body.solution,
        timestamp: timestamp,
        skillName: body.skillName,
        scenario: body.scenario,
      }
    );

    logger.info('Failure experience saved', {
      taskId: body.taskId,
      skillName: body.skillName,
      scenario: body.scenario,
    });

    return { status: 200, body: { success: true } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid failure experience payload', {
        errors: error.issues,
        body: context.request.body || {},
      });
      return { status: 400, body: { error: 'Invalid request payload', details: error.issues } };
    }

    if (error instanceof Error && error.message.includes('not found')) {
      logger.warn('Task not found for failure experience', {
        taskId: error.message.includes(':') ? error.message.split(':')[1].trim() : 'unknown',
      });
      return { status: 404, body: { error: 'Task not found' } };
    }

    logger.error('Failed to save failure experience', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { status: 500, body: { error: 'Internal server error' } };
  }
};
