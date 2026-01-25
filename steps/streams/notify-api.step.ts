import { z } from 'zod';

export const config = {
  type: 'api',
  name: 'notify-api',
  path: '/api/notify',
  method: 'POST',
  emits: [],
};

const notifySchema = z.object({
  taskId: z.string(),
  type: z.enum(['step', 'heartbeat', 'status', 'chat']),
  timestamp: z.number(),
  message: z.string().optional(),
  skill: z.string().optional(),
  data: z.any().optional(),
  stage: z.string().optional(),
});

export const handler = async (request: any, { logger, streams }: any) => {
  try {
    const body = request.body;
    const data = notifySchema.parse(body);

    // Get stage (default to 'processing' if not provided)
    const stage = data.stage || 'processing';

    // Generate unique ID for each progress notification with stage
    // Format: {taskId}-{stage}-{timestamp}-{random}
    const uniqueId = `${data.taskId}-${stage}-${data.timestamp}-${Math.random().toString(36).substring(2, 9)}`;

    // Send to Motia Stream
    // CRITICAL: Data must match taskExecutionSchema
    // IMPORTANT: Parameter order is (groupId, id, data) NOT (id, groupId, data)
    await streams.taskExecution.set(data.taskId, uniqueId, {
      taskId: data.taskId,
      task: data.message || `Skill execution (${data.type})`,
      status: stage === 'post' ? 'running' : 'running',
      sessionId: request.body?.sessionId || '',
      timestamp: new Date(data.timestamp * 1000).toISOString(),
      type: 'skill',
      skill: data.skill,
      stage: stage,
      progressType: data.type,
      metadata: {
        data: data.data,
      }
    });

    logger.info('Progress notification sent', {
      taskId: data.taskId,
      type: data.type,
      stage: stage,
      skill: data.skill,
    });

    return {
      status: 200,
      body: { success: true },
    };
  } catch (error) {
    logger.error('Failed to send notification', { error });

    return {
      status: 500,
      body: { success: false, error: (error as Error).message },
    };
  }
};
