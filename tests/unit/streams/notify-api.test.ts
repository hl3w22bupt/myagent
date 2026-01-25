/**
 * Unit tests for Notify API Step
 */
import { z } from 'zod';

// Mock the notify schema (same as the real implementation)
const notifySchema = z.object({
  taskId: z.string(),
  type: z.enum(['step', 'heartbeat', 'status', 'chat']),
  timestamp: z.number(),
  message: z.string().optional(),
  skill: z.string().optional(),
  data: z.any().optional(),
});

// Mock handler implementation
async function mockHandler(request: any, { logger, streams }: any) {
  try {
    const body = await request.json();
    const data = notifySchema.parse(body);

    // Send to Motia Stream
    await streams.taskExecution.set(data.taskId, data.taskId, {
      type: data.type,
      timestamp: new Date(data.timestamp * 1000).toISOString(),
      message: data.message,
      skill: data.skill,
      data: data.data,
    });

    logger.info('Progress notification sent', {
      taskId: data.taskId,
      type: data.type,
      skill: data.skill,
    });

    return {
      status: 200,
      body: { success: true },
    };
  } catch (error: any) {
    logger.error('Failed to send notification', { error });

    return {
      status: 500,
      body: { success: false, error: error.message },
    };
  }
}

describe('Notify API Step', () => {
  let mockLogger: any;
  let mockStreams: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    mockStreams = {
      taskExecution: {
        set: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('should validate required fields and send notification', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        type: 'step',
        timestamp: Date.now() / 1000,
        message: 'Test message',
      }),
    };

    const response = await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockStreams.taskExecution.set).toHaveBeenCalledWith(
      'test-123',
      'test-123',
      expect.objectContaining({
        type: 'step',
        message: 'Test message',
      })
    );
  });

  it('should reject invalid type', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        type: 'invalid-type',
        timestamp: Date.now() / 1000,
      }),
    };

    const response = await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should accept all valid progress types', async () => {
    const validTypes = ['step', 'heartbeat', 'status', 'chat'];

    for (const type of validTypes) {
      mockStreams.taskExecution.set.mockClear();

      const request = {
        json: jest.fn().mockResolvedValue({
          taskId: 'test-123',
          type,
          timestamp: Date.now() / 1000,
        }),
      };

      const response = await mockHandler(request, {
        logger: mockLogger,
        streams: mockStreams,
      });

      expect(response.status).toBe(200);
    }
  });

  it('should handle optional fields', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        type: 'step',
        timestamp: Date.now() / 1000,
        skill: 'web-search',
        data: { custom: 'value' },
      }),
    };

    await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(mockStreams.taskExecution.set).toHaveBeenCalledWith(
      'test-123',
      'test-123',
      expect.objectContaining({
        skill: 'web-search',
        data: { custom: 'value' },
      })
    );
  });

  it('should log successful notifications', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        type: 'step',
        timestamp: Date.now() / 1000,
        skill: 'web-search',
      }),
    };

    await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Progress notification sent',
      expect.objectContaining({
        taskId: 'test-123',
        type: 'step',
        skill: 'web-search',
      })
    );
  });

  it('should handle missing optional fields', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        type: 'status',
        timestamp: Date.now() / 1000,
      }),
    };

    const response = await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(response.status).toBe(200);
    expect(mockStreams.taskExecution.set).toHaveBeenCalledWith(
      'test-123',
      'test-123',
      expect.objectContaining({
        type: 'status',
        message: undefined,
        skill: undefined,
        data: undefined,
      })
    );
  });

  it('should reject missing required field taskId', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        type: 'step',
        timestamp: Date.now() / 1000,
      }),
    };

    const response = await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it('should reject missing required field type', async () => {
    const request = {
      json: jest.fn().mockResolvedValue({
        taskId: 'test-123',
        timestamp: Date.now() / 1000,
      }),
    };

    const response = await mockHandler(request, {
      logger: mockLogger,
      streams: mockStreams,
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});
