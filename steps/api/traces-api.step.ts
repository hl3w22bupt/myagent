/**
 * Execution Traces API Step.
 *
 * API endpoints for fetching execution traces for a task.
 * Returns flat trace array with filtering handled on the frontend.
 */

import { type StepConfig, logger } from '../../src/iii-bridge.js';
import { z } from 'zod';
import { executionTracesStream } from '../streams/execution-traces.stream.js';
import { getDataStore } from '../../src/core/database/data-store.js';
import { PostgresTokenUsageStorage } from '../token-usage/storage/postgres-token-storage.js';
import Redis from 'ioredis';

const MAX_TRACES = 1000;
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Get Execution Traces API Step configuration.
 */
export const config = {
  name: 'execution-traces-api',
  description: 'API endpoint for fetching execution traces for a task',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/tasks/:id/traces' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Input schema for execution traces requests.
 */
const _taskIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/);

/**
 * Execution Traces handler.
 */
export const handler: any = async (context: any) => {
  const taskId = context.request.pathParams.id;

  logger.info('Execution Traces API: Received request', { taskId });

  try {
    let traces: any[] = [];

    // Try database first (persisted across restarts)
    try {
      const store = getDataStore();
      const pool = 'getPool' in store && typeof store.getPool === 'function'
        ? store.getPool()
        : null;
      if (pool) {
        const storage = new PostgresTokenUsageStorage(pool);
        await storage.initializeTables();
        traces = await storage.getExecutionTraces(taskId);
      }
    } catch (dbError: any) {
      logger.warn('Execution Traces API: DB read failed', {
        taskId,
        error: dbError.message,
      });
    }

    // Fallback to Redis if DB returned nothing
    if (traces.length === 0) {
      try {
        const key = `motia:stream:executionTraces:group:${taskId}`;
        const hashSize = await redisClient.hlen(key);

        if (hashSize > 0) {
          if (hashSize <= MAX_TRACES) {
            const allData = await redisClient.hgetall(key);
            traces = Object.values(allData).map((v: string) => {
              try { return JSON.parse(v); } catch { return null; }
            }).filter(Boolean);
          } else {
            const allKeys = await redisClient.hkeys(key);
            const keyWithTime = allKeys.map(k => {
              const parts = k.split('-');
              const ts = Number(parts[parts.length - 1]) || 0;
              return { key: k, ts };
            });
            keyWithTime.sort((a, b) => b.ts - a.ts);
            const latestKeys = keyWithTime.slice(0, MAX_TRACES).map(k => k.key);
            const values = await redisClient.hmget(key, ...latestKeys);
            traces = values.map((v: string | null) => {
              if (!v) return null;
              try { return JSON.parse(v); } catch { return null; }
            }).filter(Boolean);
            traces.sort((a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          }
        }
      } catch (redisError: any) {
        logger.warn('Execution Traces API: Redis read failed', {
          taskId,
          error: redisError.message,
        });
      }
    }

    // Last resort: in-memory stream
    if (traces.length === 0) {
      const traceData = await executionTracesStream.list(taskId);
      traces = Array.isArray(traceData) ? traceData : traceData ? [traceData] : [];
    }

    logger.info('Execution Traces API: Retrieved data', {
      taskId,
      dataCount: traces.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        taskId,
        traces,
      },
    };
  } catch (error: any) {
    logger.error('Execution Traces API: Error', {
      error: error.message,
      stack: error.stack,
      taskId,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to fetch execution traces',
        error: error.message,
      },
    };
  }
};
