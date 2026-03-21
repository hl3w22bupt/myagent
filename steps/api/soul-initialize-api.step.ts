/**
 * Soul Initialize API Step
 *
 * Creates a Soul Agent instance with an idle task.
 * Called by MyEcho after creating an echo thread.
 */

import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import { MessageIdGenerator } from '../../src/utils/message-id-generator';

/**
 * Soul Initialize API configuration
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'soul-initialize',
  description: 'Initialize Soul Agent with idle task',

  path: '/api/soul/:soulId/initialize',
  method: 'POST',

  emits: [],
  flows: ['agent-workflow'],
};

/**
 * Request schema
 */
const requestSchema = {
  soulId: 'string',
  userId: 'string',
  characterId: 'string',  // MyEcho character ID
  deviceId: 'string',     // MyEcho device ID
  taskName: 'string',     // Task display name (optional, defaults to "对话")
  app: 'string',          // App identifier (optional, defaults to "myecho")
  threadId: 'string',     // MyEcho thread ID (optional)
  metadata: 'object',     // Optional metadata
};

/**
 * Soul Initialize handler
 */
export const handler = async (request: any, { logger, streams }: any) => {
  // Get soulId from path parameters
  const soulId = request.pathParams?.soulId || request.params?.soulId;
  const {
    userId,
    characterId,
    deviceId,
    taskName,
    app,
    threadId,
    metadata = {}
  } = request.body;

  logger.info('Soul Initialize API: Received request', {
    soulId,
    userId,
    characterId,
    deviceId,
    taskName,
    app,
    threadId
  });

  // Validate required fields
  if (!userId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing required field: userId'
      }
    };
  }

  if (!characterId) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Missing required field: characterId'
      }
    };
  }

  try {
    const sessionId = `soul-${soulId}-${userId}`;
    const taskId = `task-${sessionId}`;

    // 1. Create idle task in database
    const dataStore = getDataStore();
    await dataStore.initialize();

    // Check if task already exists
    const existingTask = await dataStore.getTask(taskId).catch(() => null);

    if (!existingTask) {
      // Create task with idle status using createTask method
      const taskData = {
        id: taskId,
        sessionId: sessionId,
        task: taskName || `对话${threadId ? ` ${threadId}` : ''}`,
        status: 'idle' as const,  // ← Idle state, waiting for trigger
        app: app || 'myecho',
        metadata: {
          ...metadata,
          type: 'soul_agent',
          soulId: soulId,
          userId: userId,
          characterId: characterId,
          deviceId: deviceId,
          threadId: threadId,
          subagent: soulId,  // Soul ID maps to subagent
        }
      };

      await dataStore.createTask(taskData);

      logger.info('Soul Initialize API: Created idle task', {
        taskId,
        sessionId,
        task: taskData.task,
        app: taskData.app,
        status: 'idle'
      });
    } else {
      logger.info('Soul Initialize API: Task already exists', {
        taskId,
        sessionId,
        status: existingTask.status
      });
    }

    // 2. Get or create Soul Agent (use activateSoul for idempotency)
    const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

    logger.info('Soul Initialize API: Soul Agent ready', {
      sessionId,
      soulId,
      taskId
    });

    // 3. Send initialization event to stream
    if (streams?.taskExecution) {
      const uniqueId = `${taskId}-init-${Date.now()}`;
      await streams.taskExecution.set(taskId, uniqueId, {
        taskId: taskId,
        task: '',
        status: 'idle',
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        type: 'soul',
        stage: 'initialized',
        progressType: 'soul_init',
        metadata: {
          data: {
            soulId: soulId,
            userId: userId,
            message: 'Soul Agent initialized with idle task'
          }
        }
      });
    }

    return {
      status: 200,
      body: {
        success: true,
        data: {
          sessionId: sessionId,
          taskId: taskId,
          soulId: soulId,
          userId: userId,
          characterId: characterId,
          status: 'idle',
          message: 'Soul Agent initialized successfully'
        }
      }
    };

  } catch (error: any) {
    logger.error('Soul Initialize API: Failed to initialize', {
      error: error.message,
      stack: error.stack
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};
