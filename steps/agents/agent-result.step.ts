/**
 * Agent Result API Step.
 *
 * REST API endpoint for querying a single agent task execution result.
 * Accepts HTTP requests and returns a specific task result from state.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import type { ArtifactIndex } from '../../src/core/database/context-types';

/**
 * Metadata cache to avoid repeated character-indexed reconstruction
 * Key: taskId, Value: parsed metadata object
 */
const metadataCache = new Map<string, any>();
const MAX_CACHE_SIZE = 1000;

/**
 * Query parameters schema for single result API.
 */
export const querySchema = z.object({
  /**
   * Task ID to query (required).
   */
  id: z.string().min(1, 'Task ID is required').describe('Task ID to query specific result'),
});

/**
 * Agent Result API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'agent-result-api',
  description: 'REST API endpoint for querying a single agent task result',

  /**
   * API route configuration.
   */
  path: '/agent/result',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Agent Result API handler.
 *
 * Retrieves a single task result from state based on task ID.
 */
export const handler = async (request: any, { logger }: any) => {
  // Parse query parameters - use queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const validationResult = querySchema.safeParse(queryParams);

  if (!validationResult.success) {
    return {
      status: 400,
      body: {
        success: false,
        message: `Invalid query parameters: ${validationResult.error.message}`,
      },
    };
  }

  const { id } = validationResult.data;

  logger.info('Agent Result API: Received query request', { taskId: id });

  try {
    // Query from database
    const unifiedStore = getDataStore();
    const task = await unifiedStore.getTask(id);

    if (!task) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Task with ID ${id} not found`,
          taskId: id,
        },
      };
    }

    // Get artifacts for this task
    const artifacts = await unifiedStore.getArtifacts(id);

    // Map database task to API response format
    const success = task.status === 'completed';

    // Handle potentially invalid dates
    const safeToISOString = (date: Date | undefined) => {
      if (!date) return undefined;
      if (isNaN(date.getTime())) {
        logger.warn(`Invalid date for task ${task.id}`);
        return new Date().toISOString();
      }
      return date.toISOString();
    };

    // Fix: Handle character-indexed metadata format
    // Database returns mixed structure: {"0":"{",...,"3417":"}", llmCalls:1, skillNames:[...]}
    let parsedMetadata = task.metadata;

    // Helper function to reconstruct character-indexed metadata with caching
    const reconstructCharIndexedMetadata = (charIndexedObj: any): any => {
      const keys = Object.keys(charIndexedObj);

      // Separate numeric keys (character-indexed JSON) from non-numeric keys (extra fields)
      const numericKeys = keys.filter(k => /^\d+$/.test(k)).sort((a, b) => parseInt(a) - parseInt(b));
      const nonNumericKeys = keys.filter(k => !/^\d+$/.test(k));

      // Only warn if metadata is unusually large (> 1000 keys indicates storage inefficiency)
      if (numericKeys.length > 1000) {
        logger.warn(`[AgentResultAPI] Large character-indexed metadata (${numericKeys.length} keys) for task ${id} - Consider migrating to JSONB format for better performance`);
      } else {
        // Normal case with moderate key count: use debug level
        logger.debug(`[AgentResultAPI] Reconstructing character-indexed metadata (${numericKeys.length} keys) for task ${id}`);
      }

      // Reconstruct JSON from numeric keys only
      const charIndexedPart: any = {};
      numericKeys.forEach(k => {
        charIndexedPart[k] = charIndexedObj[k];
      });
      const reconstructed = Object.values(charIndexedPart).join('');

      // Extract extra fields (llmCalls, skillCalls, skillNames, etc.)
      const extraFields: any = {};
      nonNumericKeys.forEach(k => {
        extraFields[k] = charIndexedObj[k];
      });

      // Parse and merge
      const parsed = JSON.parse(reconstructed);
      return { ...parsed, ...extraFields };
    }

    // Check cache first
    if (metadataCache.has(id)) {
      parsedMetadata = metadataCache.get(id);
      logger.info('[AgentResultAPI] Using cached metadata for task:', id);
    } else {

    // Case 1: String format - parse and check if character-indexed
    if (typeof parsedMetadata === 'string') {
      try {
        const parsed = JSON.parse(parsedMetadata);

        // Check if result is character-indexed
        if (typeof parsed === 'object' && parsed !== null) {
          const keys = Object.keys(parsed);
          const isCharIndexed = keys.length > 10 &&
            keys.slice(0, 10).every((k, i) => k === String(i));

          if (isCharIndexed) {
            parsedMetadata = reconstructCharIndexedMetadata(parsed);
            // Cache the reconstructed metadata
            if (metadataCache.size < MAX_CACHE_SIZE) {
              metadataCache.set(id, parsedMetadata);
            }
          } else {
            parsedMetadata = parsed;
          }
        }
      } catch (error: any) {
        logger.error('[AgentResultAPI] Failed to parse metadata: ' + error.message);
        parsedMetadata = {};
      }
    }
    // Case 2: Object format - check if character-indexed
    else if (typeof parsedMetadata === 'object' && parsedMetadata !== null) {
      const keys = Object.keys(parsedMetadata);
      const isCharIndexed = keys.length > 10 &&
        keys.slice(0, 10).every((k, i) => k === String(i));

      if (isCharIndexed) {
        try {
          parsedMetadata = reconstructCharIndexedMetadata(parsedMetadata);
          // Cache the reconstructed metadata
          if (metadataCache.size < MAX_CACHE_SIZE) {
            metadataCache.set(id, parsedMetadata);
          }
        } catch (error: any) {
          logger.error('[AgentResultAPI] Failed to reconstruct metadata: ' + error.message);
          parsedMetadata = {};
        }
      }
    }
    } // End cache check

    return {
      status: 200,
      body: {
        success: true,
        result: {
          taskId: task.id,
          task: task.task,
          success: success,
          output: task.output,
          error: task.error,
          executionTime: task.executionTime,
          metadata: parsedMetadata,  // Use parsed metadata
          structuredOutput: task.structuredOutput,  // Structured output at root level
          sessionId: task.sessionId,
          timestamp: safeToISOString(task.createdAt) || new Date().toISOString(),
          // Include artifacts array
          artifacts: artifacts.map((artifact: ArtifactIndex) => ({
            id: artifact.id,
            type: artifact.artifactType,
            action: artifact.action,
            path: artifact.path,
            description: artifact.description,
            metadata: artifact.metadata,
            timestamp: artifact.timestamp instanceof Date
              ? artifact.timestamp.toISOString()
              : new Date(artifact.timestamp).toISOString(),
          })),
        },
      },
    };
  } catch (error: any) {
    logger.error('Agent Result API: Error retrieving result', {
      error: error.message,
      stack: error.stack,
    });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve task result',
        error: error.message,
      },
    };
  }
};
