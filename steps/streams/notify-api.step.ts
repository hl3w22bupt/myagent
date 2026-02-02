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

    // 过滤消息内容，只保留用户友好的信息
    let displayMessage = data.message || `Skill execution (${data.type})`;

    // 对于 step 类型的通知（skill执行日志），过滤掉DEBUG日志
    if (data.type === 'step' && data.message) {
      // 过滤掉以 [DEBUG] 开头的行
      const lines = data.message.split('\n');
      const filteredLines = lines.filter(line => !line.trim().startsWith('[DEBUG]'));

      // 如果过滤后有内容，使用过滤后的内容；否则使用默认描述
      if (filteredLines.length > 0 && filteredLines.some(line => line.trim())) {
        displayMessage = filteredLines.join('\n').trim();
      } else {
        // 全是DEBUG日志，使用简洁的skill名称
        displayMessage = data.skill ? `执行 ${data.skill}` : '执行技能';
      }
    }

    await streams.taskExecution.set(data.taskId, uniqueId, {
      taskId: data.taskId,
      task: displayMessage,
      // FIX: Send 'completed' status when post hook finishes successfully
      // This allows frontend to detect task completion and refresh automatically
      status: (stage === 'post' && data.data?.success === true) ? 'completed' :
              (stage === 'post' && data.data?.success === false) ? 'failed' : 'running',
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
