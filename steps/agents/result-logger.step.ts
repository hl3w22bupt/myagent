/**
 * Agent Result Logger Step.
 *
 * Listens to agent task completion events and logs results.
 * Provides audit trail and execution history.
 *
 * FIX: Added circular reference detection and history size limits
 * to prevent Motia wrapObject infinite recursion bug.
 * See: https://github.com/motiadev/motia/issues/xxx
 */

import { z } from 'zod';
import { EventConfig } from 'motia';
import { hasCircularReference } from '../../src/utils/state-safety';
import { stateLockManager } from '../../src/utils/state-lock';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';

/**
 * Configuration for execution history limits.
 * Reduced from 100 to 20 to prevent wrapObject stack overflow.
 */
const MAX_HISTORY_SIZE = 20;

/**
 * Simplify history entry to prevent complex nested structures.
 * Reduces memory and prevents wrapObject issues.
 */
function simplifyHistoryEntry(entry: any): any {
  return {
    taskId: entry.taskId,
    timestamp: entry.timestamp,
    task: entry.task,
    success: entry.success,
    sessionId: entry.sessionId,
    output: entry.output, // 不截断，保留完整输出
    error: entry.error,
    executionTime: entry.executionTime,
    metadata: entry.metadata,
  };
}

/**
 * Input schema for result logger.
 *
 * Handles both successful completions (agent.task.completed)
 * and failures (agent.task.failed) with different data structures.
 */
export const inputSchema = z
  .object({
    /**
     * Task ID for tracking.
     */
    taskId: z.string().optional(),

    /**
     * Task that was executed.
     */
    task: z.string().optional(),

    /**
     * Session ID.
     */
    sessionId: z.string().optional(),

    /**
     * Nested result object from Agent execution (present in completed events).
     */
    result: z
      .object({
        /**
         * Whether execution succeeded.
         */
        success: z.boolean(),

        /**
         * Output from agent execution.
         */
        output: z.string().optional(),

        /**
         * Error message if execution failed.
         */
        error: z.string().optional(),

        /**
         * Execution time in ms.
         */
        executionTime: z.number().optional(),

        /**
         * State information.
         */
        state: z
          .object({
            conversationLength: z.number().optional(),
            executionCount: z.number().optional(),
            variablesCount: z.number().optional(),
          })
          .optional(),

        /**
         * Execution metadata.
         */
        metadata: z
          .object({
            llmCalls: z.number(),
            skillCalls: z.number(),
            totalTokens: z.number(),
          })
          .optional(),
      })
      .optional(),

    /**
     * Direct error field (present in failed events).
     */
    error: z.string().optional(),

    /**
     * Stack trace (present in failed events).
     */
    stack: z.string().optional(),
  })
  .passthrough();

/**
 * Result Logger Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'result-logger',
  description: 'Logs agent task execution results for audit trail',

  /**
   * Subscribe to both successful and failed agent task events.
   */
  subscribes: ['agent.task.completed', 'agent.task.failed'],

  /**
   * No events emitted (direct database access).
   */
  emits: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow'],
};

/**
 * Parse unified format result from output string.
 *
 * Skills return results in Python dict syntax embedded in output:
 * output={'result_type': 'video', 'success': True, ...}
 *
 * This function extracts and parses that structured result.
 */
function parseUnifiedResult(output: string | undefined): Record<string, unknown> | null {
  if (!output || typeof output !== 'string') {
    return null;
  }

  try {
    // Look for Python dict pattern: output={...}
    const outputMatch = output.indexOf('output={');
    if (outputMatch === -1) {
      return null;
    }

    // Find the complete dict by counting braces
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let dictEnd = -1;

    for (let i = outputMatch + 7; i < output.length; i++) {
      const char = output[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === "'" && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            dictEnd = i;
            break;
          }
        }
      }
    }

    if (dictEnd === -1) {
      return null;
    }

    const pythonDict = output.substring(outputMatch + 7, dictEnd + 1);

    // Convert Python syntax to JavaScript-compatible syntax
    // Then use Function constructor to safely evaluate
    const jsObjectStr = pythonDict
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      // Replace single quotes with double quotes for strings
      .replace(/'/g, '"');

    // Safely evaluate the object literal
    // We wrap in parentheses to ensure it's treated as an expression
    const parsed = (new Function(`return (${jsObjectStr})`))();

    // Verify it has required unified format fields
    if (parsed && typeof parsed === 'object' &&
        parsed.result_type && typeof parsed.success === 'boolean') {
      return parsed;
    }

    return null;
  } catch {
    // If parsing fails, return null - output is not in unified format
    return null;
  }
}

/**
 * Result Logger handler.
 *
 * Logs agent execution results to console and optionally to file/database.
 * Handles both agent.task.completed and agent.task.failed events.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: z.infer<typeof inputSchema>, { logger, state }: any) => {
  const timestamp = new Date().toISOString();

  // Determine if this is a completed or failed event
  const isFailedEvent = !input.result && input.error;

  // Normalize data structure
  const normalizedResult = isFailedEvent
    ? {
        // Failed event: extract from direct fields
        success: false,
        error: input.error,
        output: input.stack,
        executionTime: undefined,
        metadata: undefined,
      }
    : (input.result || {
        // Fallback for completed event without result
        success: true,
        output: undefined,
        error: undefined,
        executionTime: undefined,
        metadata: undefined,
      }); // Completed event: use nested result

  const taskId = input.taskId;
  const task = input.task || 'Unknown task';
  const sessionId = input.sessionId;

  // 🔍 DIAGNOSIS: 检查接收到的 metadata 格式
  const receivedMetadataKeys = Object.keys(normalizedResult.metadata || {});
  const isReceivedMetadataCharIndexed = receivedMetadataKeys.length > 10 &&
    receivedMetadataKeys.slice(0, 10).every((k, i) => k === String(i));

  logger.info('[🔍 DIAGNOSIS] Received metadata format', {
    taskId,
    metadataKeysCount: receivedMetadataKeys.length,
    isCharIndexed: isReceivedMetadataCharIndexed,
    firstKeys: receivedMetadataKeys.slice(0, 20),
    metadataPreview: normalizedResult.metadata ?
      JSON.stringify(normalizedResult.metadata).substring(0, 200) : 'undefined',
  });

  // NOTE: structuredOutput is now at root level (Agent.run() returns it there)
  // No need to move it from root to metadata anymore
  // For backward compatibility, we still support reading from metadata if needed

  // Parse unified format result from output FIRST (before database update)
  logger.info('Parsing unified format result from task output', {
    taskId,
    hasOutput: !!normalizedResult.output,
    outputLength: normalizedResult.output?.length || 0,
    outputPreview: normalizedResult.output?.substring(0, 150) || 'no output',
  });

  const structuredResult = parseUnifiedResult(normalizedResult.output);

  logger.info('[🔍 DIAGNOSIS] Unified format result parsed', {
    taskId,
    hasStructuredResult: !!structuredResult,
    resultType: structuredResult?.result_type,
    hasContent: !!structuredResult?.content,
    success: structuredResult?.success,
    contentKeys: structuredResult?.content ? Object.keys(structuredResult.content) : [],
  });

  // Override success status if unified format result has a success field
  // This is important for skills like remotion-generator that return error results
  // but still exit cleanly (exitCode=0)
  if (structuredResult && typeof structuredResult.success === 'boolean') {
    const originalSuccess = normalizedResult.success;
    normalizedResult.success = structuredResult.success as boolean;

    // Update error message if available
    if (!normalizedResult.success && structuredResult.content) {
      const content = structuredResult.content as any;
      if (content.message) {
        normalizedResult.error = content.message;
      }
    }

    // Log if status was overridden
    if (originalSuccess !== normalizedResult.success) {
      logger.warn('Task success status overridden by unified format result', {
        taskId,
        originalSuccess,
        overriddenSuccess: normalizedResult.success,
        resultType: structuredResult.result_type,
      });
    }
  }

  // Update task record in database AFTER status override
  if (taskId) {
    try {
      const store = getDataStore();
      const finalStatus = normalizedResult.success ? TaskStatus.COMPLETED : TaskStatus.FAILED;

      // Check if this is a video output and save to artifacts
      logger.info('[🔍 DIAGNOSIS] Checking for unified format video', {
        taskId,
        resultType: structuredResult?.result_type,
        hasContent: !!structuredResult?.content,
      });

      if (structuredResult?.result_type === 'video' && structuredResult.content) {
        const content = structuredResult.content as any;
        let videoUrl = content.videoUrl || content.url || content.path;

        logger.info('[🔍 DIAGNOSIS] ✅ Found unified format video', {
          taskId,
          videoUrl,
          contentFields: Object.keys(content),
        });

        if (videoUrl) {
          // Normalize the path: ensure it's a relative path without leading slash
          // and includes videos/ prefix if it's a local file
          const originalVideoUrl = videoUrl;
          if (videoUrl.startsWith('/')) {
            videoUrl = videoUrl.substring(1); // Remove leading slash
          }
          if (!videoUrl.startsWith('videos/') && !videoUrl.startsWith('outputs/')) {
            videoUrl = 'videos/' + videoUrl; // Add videos/ prefix
          }

          logger.info('[🔍 DIAGNOSIS] Saving video artifact from unified format', {
            taskId,
            originalUrl: originalVideoUrl,
            normalizedUrl: videoUrl,
          });

          await store.addArtifact({
            taskId,
            artifactType: 'video',
            action: 'generated',
            path: videoUrl,
            // 优先使用 content.description，否则使用完整的 task（不截断）
            description: content.description || `Video generated: ${task}`,
            timestamp: new Date(),
          });

          logger.info('[🔍 DIAGNOSIS] ✅ Video artifact saved (unified format)', {
            taskId,
            videoUrl,
          });
        } else {
          logger.warn('[🔍 DIAGNOSIS] ⚠️ Video result has no URL', {
            taskId,
            content: JSON.stringify(content).substring(0, 200),
          });
        }
      } else {
        logger.info('[🔍 DIAGNOSIS] No unified format video found', {
          taskId,
          resultType: structuredResult?.result_type,
        });
      }

      // Also check if output contains video paths (for skills that don't use unified format)
      // This handles cases where the skill returns plain text with embedded video paths
      logger.info('[🔍 DIAGNOSIS] Checking output string for video paths', {
        taskId,
        hasOutput: !!normalizedResult.output,
        outputType: typeof normalizedResult.output,
        outputLength: normalizedResult.output?.length || 0,
      });

      if (normalizedResult.output && typeof normalizedResult.output === 'string') {
        // Find all unique video paths using regex
        const videoPattern = /videos\/[\w-]+_video_(\d+)\.mp4/g;
        let match;
        const uniquePaths = new Map<string, number>(); // path -> number
        let matchCount = 0;

        logger.info('[🔍 DIAGNOSIS] Executing regex to find video paths', {
          taskId,
          pattern: videoPattern.source,
          outputLength: normalizedResult.output.length,
        });

        while ((match = videoPattern.exec(normalizedResult.output)) !== null) {
          matchCount++;
          const path = match[0];
          const number = parseInt(match[1], 10); // match[1] 是第一个捕获组
          // 使用 Map 自动去重，保留唯一的路径
          uniquePaths.set(path, number);

          logger.info('[🔍 DIAGNOSIS] ✅ Found video path', {
            taskId,
            matchNumber: matchCount,
            videoPath: path,
            videoNumber: number,
            matchIndex: match.index,
          });
        }

        logger.info('[🔍 DIAGNOSIS] Regex matching completed', {
          taskId,
          totalMatches: matchCount,
          uniquePaths: uniquePaths.size,
          paths: Array.from(uniquePaths.entries()),
        });

        if (uniquePaths.size > 0) {
          logger.info(`[🔍 DIAGNOSIS] Found ${uniquePaths.size} video paths, saving artifacts`, {
            taskId,
            paths: Array.from(uniquePaths.keys()),
          });

          for (const [videoPath, videoNumber] of uniquePaths.entries()) {
            try {
              logger.info('[🔍 DIAGNOSIS] Saving video artifact', {
                taskId,
                videoPath,
                videoNumber,
              });

              // 保留完整的任务描述，不截断
              // taskDesc 保持完整，前端 CSS 会处理显示时的截断
              const taskDesc = task;

              await store.addArtifact({
                taskId,
                artifactType: 'video',
                action: 'generated',
                path: videoPath,
                description: `Video ${videoNumber}: ${taskDesc}`,
                timestamp: new Date(),
              });

              logger.info('[🔍 DIAGNOSIS] ✅ Video artifact saved', {
                taskId,
                videoPath,
                videoNumber,
              });
            } catch (error: any) {
              logger.error('[🔍 DIAGNOSIS] ❌ Failed to save artifact', {
                taskId,
                videoPath,
                error: error.message,
                stack: error.stack,
              });
            }
          }
        } else {
          logger.warn('[🔍 DIAGNOSIS] ⚠️ No video paths found in output', {
            taskId,
            outputPreview: normalizedResult.output.substring(0, 500),
          });
        }
      } else {
        logger.warn('[🔍 DIAGNOSIS] ⚠️ Output not a string', {
          taskId,
          outputType: typeof normalizedResult.output,
        });
      }

      // 检查是否是 code output 并保存到 artifacts
      if (structuredResult?.result_type === 'code' && structuredResult.content) {
        const content = structuredResult.content as any;
        const code = content.code;
        const language = content.language || 'text';

        logger.info('[🔍 DIAGNOSIS] ✅ Found code output', {
          taskId,
          language,
          codeLength: code?.length || 0,
        });

        if (code) {
          // 生成唯一标识符作为 path
          const artifactPath = `code_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${language}`;

          await store.addArtifact({
            taskId,
            artifactType: 'code',
            action: 'generated',
            path: artifactPath,
            description: content.description || `Generated ${language} code`,
            metadata: {
              // 使用 metadata 存储扩展属性
              language: language,
              codeLength: code.length,
              ...(content.highlight && { highlight: content.highlight }),
            },
            timestamp: new Date(),
          });

          logger.info('[🔍 DIAGNOSIS] ✅ Code artifact saved', {
            taskId,
            artifactPath,
            language,
            metadata: { language, codeLength: code.length },
          });
        }
      } else {
        logger.info('[🔍 DIAGNOSIS] No code output found', {
          taskId,
          resultType: structuredResult?.result_type,
        });
      }

      // Check if this is a multi-turn continuation (task already completed)
      const currentTask = await store.getTask(taskId);

      logger.info('[🔍 DIAGNOSIS] Current task from database', {
        taskId,
        hasCurrentTask: !!currentTask,
        currentStatus: currentTask?.status,
        currentOutputLength: currentTask?.output?.length || 0,
      });

      // 🔍 DIAGNOSIS: 检查 currentTask.metadata 的格式
      const currentMetadataKeys = Object.keys(currentTask?.metadata || {});
      const isCurrentMetadataCharIndexed = currentMetadataKeys.length > 10 &&
        currentMetadataKeys.slice(0, 10).every((k, i) => k === String(i));

      logger.info('[🔍 DIAGNOSIS] Current task metadata format', {
        taskId,
        hasMetadata: !!currentTask?.metadata,
        metadataKeysCount: currentMetadataKeys.length,
        isCharIndexed: isCurrentMetadataCharIndexed,
        firstKeys: currentMetadataKeys.slice(0, 20),
        metadataPreview: currentTask?.metadata ?
          JSON.stringify(currentTask.metadata).substring(0, 200) : 'undefined',
      });

      const isMultiTurnContinuation = currentTask?.status === TaskStatus.COMPLETED;

      logger.info('[🔍 DIAGNOSIS] Multi-turn check', {
        taskId,
        isMultiTurnContinuation,
        currentStatus: currentTask?.status,
        finalStatus,
        willUpdateOutput: !isMultiTurnContinuation,
        explanation: isMultiTurnContinuation
          ? 'Multi-turn: NOT updating output (preserving first round)'
          : 'First round: updating all fields including output',
      });

      if (isMultiTurnContinuation) {
        // Multi-turn continuation: don't overwrite output field
        // This preserves the first round's text output while adding video artifacts
        logger.info('[🔍 DIAGNOSIS] Multi-turn: updating (preserving output)', {
          taskId,
          updatingFields: ['status', 'executionTime', 'metadata', 'completedAt'],
          preservingFields: ['output'],
        });

        await store.updateTask(taskId, {
          // CRITICAL: Always set status to completed after successful execution
          // This ensures the task status is correct even in multi-turn conversations
          status: finalStatus,
          // Don't update output - preserve first round's output
          executionTime: (currentTask.executionTime || 0) + (normalizedResult.executionTime || 0),
          // Merge metadata to preserve outputHistory from output-history-tracker
          // Use currentTask metadata which may have been updated by other steps
          metadata: {
            ...(currentTask.metadata || {}),
            ...normalizedResult.metadata,
          },
          // Store structuredOutput at root level (not in metadata)
          // For backward compatibility, also check old location in metadata
          structuredOutput: (normalizedResult as any).structuredOutput ||
                           (normalizedResult.metadata as any)?.structuredOutput ||
                           currentTask.structuredOutput,
          completedAt: new Date(),
        });

        // 🔍 DIAGNOSIS: 检查合并后的 metadata 格式
        const mergedMetadata = {
          ...(currentTask.metadata || {}),
          ...normalizedResult.metadata,
        };
        const mergedMetadataKeys = Object.keys(mergedMetadata);
        const isMergedMetadataCharIndexed = mergedMetadataKeys.length > 10 &&
          mergedMetadataKeys.slice(0, 10).every((k, i) => k === String(i));

        logger.info('[🔍 DIAGNOSIS] Merged metadata format (multi-turn)', {
          taskId,
          metadataKeysCount: mergedMetadataKeys.length,
          isCharIndexed: isMergedMetadataCharIndexed,
          firstKeys: mergedMetadataKeys.slice(0, 20),
          metadataPreview: JSON.stringify(mergedMetadata).substring(0, 200),
        });

        logger.info('[🔍 DIAGNOSIS] ✅ Multi-turn update completed', {
          taskId,
          finalStatus,
          preservedOutputPreview: currentTask.output?.substring(0, 50),
        });
      } else {
        // First round or new task: update normally
        logger.info('[🔍 DIAGNOSIS] First round: updating all fields', {
          taskId,
          finalStatus,
          outputLength: normalizedResult.output?.length || 0,
          outputPreview: normalizedResult.output?.substring(0, 100),
        });

        // RELOAD task to get latest metadata (may have been updated by output-history-tracker)
        // Retry up to 3 times with short delay to handle concurrent updates
        let latestTask = await store.getTask(taskId);
        let retryCount = 0;

        while (retryCount < 3 && !latestTask?.metadata?.outputHistory) {
          logger.info(`Retrying to get latest metadata (${retryCount + 1}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms
          latestTask = await store.getTask(taskId);
          retryCount++;
        }

        // 🔍 DIAGNOSIS: 检查 latestTask.metadata 的格式
        const latestMetadataKeys = Object.keys(latestTask?.metadata || {});
        const isLatestMetadataCharIndexed = latestMetadataKeys.length > 10 &&
          latestMetadataKeys.slice(0, 10).every((k, i) => k === String(i));

        logger.info('[🔍 DIAGNOSIS] Latest task metadata format (first round)', {
          taskId,
          hasMetadata: !!latestTask?.metadata,
          metadataKeysCount: latestMetadataKeys.length,
          isCharIndexed: isLatestMetadataCharIndexed,
          firstKeys: latestMetadataKeys.slice(0, 20),
          metadataPreview: latestTask?.metadata ?
            JSON.stringify(latestTask.metadata).substring(0, 200) : 'undefined',
        });

        await store.updateTask(taskId, {
          status: finalStatus,
          output: normalizedResult.output,
          error: normalizedResult.error,
          executionTime: normalizedResult.executionTime,
          // Merge metadata to preserve outputHistory from output-history-tracker
          // Use latestTask metadata which may have been updated by other steps
          metadata: {
            ...(latestTask?.metadata || {}),
            ...normalizedResult.metadata,
          },
          // Store structuredOutput at root level (not in metadata)
          // For backward compatibility, also check old location in metadata
          structuredOutput: (normalizedResult as any).structuredOutput ||
                           (normalizedResult.metadata as any)?.structuredOutput ||
                           latestTask?.structuredOutput,
          completedAt: new Date(),
        });

        // 🔍 DIAGNOSIS: 检查合并后的 metadata 格式
        const mergedMetadataFirstRound = {
          ...(latestTask?.metadata || {}),
          ...normalizedResult.metadata,
        };
        const mergedMetadataFirstRoundKeys = Object.keys(mergedMetadataFirstRound);
        const isMergedMetadataFirstRoundCharIndexed = mergedMetadataFirstRoundKeys.length > 10 &&
          mergedMetadataFirstRoundKeys.slice(0, 10).every((k, i) => k === String(i));

        logger.info('[🔍 DIAGNOSIS] Merged metadata format (first round)', {
          taskId,
          metadataKeysCount: mergedMetadataFirstRoundKeys.length,
          isCharIndexed: isMergedMetadataFirstRoundCharIndexed,
          firstKeys: mergedMetadataFirstRoundKeys.slice(0, 20),
          metadataPreview: JSON.stringify(mergedMetadataFirstRound).substring(0, 200),
        });

        logger.info('Task record updated in database', {
          taskId,
          finalStatus,
          hasOutputHistory: !!(latestTask?.metadata?.outputHistory),
          retries: retryCount,
        });

        // Verify update
        const updatedTask = await store.getTask(taskId);
        logger.info('Task record updated in database - verification', {
          taskId,
          requestedStatus: finalStatus,
          actualStatus: updatedTask?.status,
          updateSuccess: updatedTask?.status === finalStatus,
        });
      }
    } catch (error: any) {
      logger.warn('Failed to update task record in database', {
        error: error.message,
        taskId,
      });
      // Don't throw - continue execution even if database update fails
    }
  } else {
    logger.warn('No taskId provided, skipping database update');
  }

  logger.info(isFailedEvent ? '=== Agent Task Failed ===' : '=== Agent Task Completed ===', {
    taskId,
    task,
    success: normalizedResult.success,
    sessionId,
    timestamp,
    executionTime: normalizedResult.executionTime,
    metadata: normalizedResult.metadata,
    ...(structuredResult && {
      unifiedFormat: true,
      resultType: structuredResult.result_type,
    }),
  });

  if (normalizedResult.success) {
    // Handle both string and object outputs
    let outputPreview = normalizedResult.output;
    if (typeof normalizedResult.output === 'string' && normalizedResult.output) {
      outputPreview = normalizedResult.output.substring(0, 200) + (normalizedResult.output.length > 200 ? '...' : '');
    } else if (normalizedResult.output) {
      // Convert object to JSON for preview
      const jsonStr = JSON.stringify(normalizedResult.output) || '{}';
      outputPreview = jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : '');
    } else {
      outputPreview = '(empty output)';
    }

    logger.info('✅ Task Execution Successful', {
      output: outputPreview,
      llmCalls: normalizedResult.metadata?.llmCalls,
      skillCalls: normalizedResult.metadata?.skillCalls,
      totalTokens: normalizedResult.metadata?.totalTokens,
    });
  } else {
    // Handle both string and object outputs for errors
    let stderrPreview = normalizedResult.output;
    if (typeof normalizedResult.output === 'string' && normalizedResult.output) {
      stderrPreview = normalizedResult.output.substring(0, 500);
    } else if (normalizedResult.output) {
      const jsonStr = JSON.stringify(normalizedResult.output) || '{}';
      stderrPreview = jsonStr.substring(0, 500);
    } else {
      stderrPreview = '(no error details)';
    }

    logger.warn('❌ Task Execution Failed', {
      task,
      sessionId,
      error: normalizedResult.error,
      stderr: stderrPreview,
    });
  }

  // Store execution history in state with size limits and circular reference protection
  try {
    // Use Motia state API with groupId and key
    const groupId = 'agent:execution';
    const key = 'history';

    // ✅ 使用 atomicUpdate 保证原子性，防止竞态条件
    const updatedHistory: any[] = await stateLockManager.atomicUpdate(
      state,
      groupId,
      key,
      (history: any) => {
        // 在锁内执行，不会有竞态条件
        let current = history || [];

        // Check for circular references in existing history
        if (hasCircularReference(current)) {
          logger.warn('[result-logger] Circular reference detected in existing history, resetting', {
            historyLength: current.length
          });
          current = [];
        }

        // Remove any existing entry with the same taskId to prevent duplicates
        const duplicateIndex = current.findIndex((entry: any) => entry.taskId === taskId);
        if (duplicateIndex !== -1) {
          current.splice(duplicateIndex, 1);
          logger.info('Removed duplicate task entry', { taskId });
        }

        // Create simplified entry to prevent complex nested structures
        const newEntry = simplifyHistoryEntry({
          taskId,
          timestamp,
          task,
          success: normalizedResult.success,
          output: normalizedResult.output,
          error: normalizedResult.error,
          executionTime: normalizedResult.executionTime,
          sessionId,
          metadata: normalizedResult.metadata,
        });

        // Add new entry at the beginning
        const newHistory = [newEntry, ...current];

        // Keep only last MAX_HISTORY_SIZE entries
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.splice(MAX_HISTORY_SIZE);
        }

        // Final circular reference check before returning
        if (hasCircularReference(newHistory)) {
          logger.error('[result-logger] Circular reference detected after modification, throwing error');
          throw new Error('Circular reference in history data');
        }

        return newHistory;
      }
    );

    logger.info('Execution history updated', {
      totalEntries: updatedHistory.length,
      maxSize: MAX_HISTORY_SIZE,
      taskId,
      removedDuplicate: updatedHistory.findIndex((e: any) => e.taskId === taskId) === -1,
    });
  } catch (error: any) {
    logger.error('Failed to update execution history', {
      error: error.message,
      stack: error.stack
    });
    // Don't throw - continue execution even if state update fails
  }

  return {
    logged: true,
    timestamp,
    task,
  };
};
