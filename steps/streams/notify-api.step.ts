/**
 * Notify API Step.
 *
 * API endpoint for receiving progress notifications from Python skills.
 * Stores notifications in the task execution stream.
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { taskExecutionStream } from './task-execution.stream.js';

export const config = {
  name: 'notify-api',
  description: 'API endpoint for receiving progress notifications from Python skills',

  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/api/notify' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

const notifySchema = z.object({
  taskId: z.string(),
  type: z.enum(['step', 'heartbeat', 'status', 'chat']),
  timestamp: z.number(),
  message: z.string().optional(),
  skill: z.string().optional(),
  data: z.any().optional(),
  stage: z.string().optional(),
});

export const handler: any = async (context: any) => {
  try {
    const body = context.request.body;
    const data = notifySchema.parse(body);

    // Get stage (default to 'processing' if not provided)
    const stage = data.stage || 'processing';

    // Generate unique ID for each progress notification with stage
    // Format: {taskId}-{stage}-{timestamp}-{random}
    const uniqueId = `${data.taskId}-${stage}-${data.timestamp}-${Math.random().toString(36).substring(2, 9)}`;

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

    await taskExecutionStream.set(data.taskId, uniqueId, {
      id: uniqueId,
      taskId: data.taskId,
      task: displayMessage,
      // FIX: Send 'completed' status when post hook finishes successfully
      // This allows frontend to detect task completion and refresh automatically
      status: (stage === 'post' && data.data?.success === true) ? 'completed' :
              (stage === 'post' && data.data?.success === false) ? 'failed' : 'running',
      sessionId: context.request.body?.sessionId || '',
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
