/**
 * Token Usage Writer Step.
 *
 * Listens to token_usage_recorded events and writes token usage data to the database.
 * Implements idempotency checks to avoid duplicate processing.
 * Uses PostgreSQL with connection pooling for reliable persistence.
 */

import { z } from 'zod';
import type { EventConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import { PostgresTokenUsageStorage } from './storage/postgres-token-storage';
import type { TokenUsageRecordedEvent } from './types';

/**
 * Input schema for token usage writer.
 * Validates the token usage recorded event structure.
 */
export const inputSchema = z.object({
  traceId: z.string(),
  taskId: z.string(),
  agentId: z.string().optional(),
  skillName: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  timestamp: z.string(),
});

/**
 * Token Usage Writer configuration.
 *
 * Subscribes to token_usage_recorded events and persists data to PostgreSQL.
 * Uses idempotency checks to prevent duplicate processing.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'token-usage-writer',
  description: 'Writes token usage data to PostgreSQL database with idempotency',

  subscribes: ['token_usage_recorded'],

  emits: [],

  input: inputSchema,

  flows: ['token-usage-tracking'],
};

/**
 * Token Usage Writer handler.
 *
 * Processes token usage recorded events and persists them to the database.
 * Implements graceful error handling to avoid blocking the event stream.
 *
 * Process:
 * 1. Log received event
 * 2. Get pg.Pool from database infrastructure
 * 3. Create PostgresTokenUsageStorage instance
 * 4. Check idempotency (isTraceProcessed)
 * 5. Save task usage
 * 6. Mark trace as processed
 * 7. Handle errors gracefully
 */
export const handler = async (event: TokenUsageRecordedEvent, { logger }: any) => {
  const {
    traceId,
    taskId,
    agentId,
    skillName,
    model,
    provider,
    promptTokens,
    completionTokens,
    totalTokens,
    timestamp,
  } = event;

  logger.info('[Token Usage Writer] Received token usage event', {
    traceId,
    taskId,
    model,
    provider,
    promptTokens,
    completionTokens,
    totalTokens,
  });

  try {
    // Get database instance
    const store = getDataStore();

    // Get pg.Pool from PostgresDataStore
    // The pool is needed for PostgresTokenUsageStorage
    const pool = 'getPool' in store && typeof store.getPool === 'function'
      ? store.getPool()
      : undefined;

    if (!pool) {
      logger.error('[Token Usage Writer] Failed to get PostgreSQL pool from data store', {
        traceId,
        storeType: store.constructor.name,
      });
      return {
        success: false,
        error: 'database_not_postgres',
        message: 'Data store is not a PostgreSQL instance',
        traceId,
      };
    }

    // Create storage instance with pool
    const storage = new PostgresTokenUsageStorage(pool);

    // Ensure tables exist
    try {
      await storage.initializeTables();
      logger.debug('[Token Usage Writer] Tables initialized or already exist', { traceId });
    } catch (initError: any) {
      // Table initialization errors are not critical if tables already exist
      logger.warn('[Token Usage Writer] Table initialization had issues', {
        traceId,
        error: initError.message,
      });
    }

    // Check idempotency - skip if already processed
    const isProcessed = await storage.isTraceProcessed(traceId);
    if (isProcessed) {
      logger.info('[Token Usage Writer] Trace already processed, skipping', { traceId });
      return {
        success: true,
        skipped: true,
        reason: 'already_processed',
        traceId,
      };
    }

    // Save task usage
    await storage.saveTaskUsage(taskId, event);

    logger.info('[Token Usage Writer] Task usage saved', {
      traceId,
      taskId,
      totalTokens,
    });

    // Mark trace as processed
    await storage.markTraceProcessed(traceId);

    logger.info('[Token Usage Writer] Trace marked as processed', {
      traceId,
      taskId,
    });

    return {
      success: true,
      processed: true,
      traceId,
      taskId,
      totalTokens,
    };
  } catch (error: any) {
    // Log error but don't throw - we don't want to block the event stream
    logger.error('[Token Usage Writer] Failed to process token usage event', {
      traceId,
      taskId,
      error: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
    });

    // Return error instead of throwing to avoid blocking
    return {
      success: false,
      error: 'processing_failed',
      message: error.message,
      traceId,
      taskId,
    };
  }
};
