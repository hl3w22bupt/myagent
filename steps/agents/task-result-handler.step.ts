/**
 * Task Result Handler Step.
 *
 * Listens to agent task completion/failure events and handles results:
 * - Parses unified format results from skills
 * - Saves artifacts (videos, code, infographics, tables) to database
 * - Updates task status and metadata
 * - Logs execution results for audit trail
 * - Maintains execution history in state
 */

import { z } from 'zod';
import { EventConfig } from 'motia';
import { stateLockManager } from '../../src/utils/state-lock';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Configuration for execution history limits.
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
 * Task Result Handler Step configuration.
 */
export const config: EventConfig = {
  type: 'event',
  name: 'task-result-handler',
  description: 'Handles agent task results: parses output, saves artifacts, updates task status',

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
    : {
        // Completed event: use nested result
        ...input.result,
        structuredOutput: (input.result as any)?.structuredOutput, // Extract structuredOutput
      };

  const taskId = input.taskId;
  const task = input.task || 'Unknown task';
  const sessionId = input.sessionId;

  // NOTE: structuredOutput is now at root level (Agent.run() returns it there)
  // No need to move it from root to metadata anymore
  // For backward compatibility, we still support reading from metadata if needed

  // Parse unified format result from output FIRST (before database update)
  logger.info('Parsing unified format result from task output', {
    taskId,
    hasOutput: !!normalizedResult.output,
    outputLength: normalizedResult.output?.length || 0,
  });

  // Check structuredOutput first
  const structuredOutput = (normalizedResult as any).structuredOutput;
  const structuredResult = parseUnifiedResult(normalizedResult.output);

  // IMPORTANT: Also check structuredOutput field (from file)
  // For skills like infographic-generator that write structured output to file
  // Use structuredOutput if structuredResult is not available
  const finalStructuredResult = structuredResult || structuredOutput;

  // Override success status if unified format result has a success field
  // This is important for skills like remotion-generator that return error results
  // but still exit cleanly (exitCode=0)
  if (finalStructuredResult && typeof finalStructuredResult.success === 'boolean') {
    const originalSuccess = normalizedResult.success;
    normalizedResult.success = finalStructuredResult.success as boolean;

    // Update error message if available
    if (!normalizedResult.success && finalStructuredResult.content) {
      const content = finalStructuredResult.content as any;
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
        resultType: finalStructuredResult.result_type,
      });
    }
  }

  // Update task record in database AFTER status override
  if (taskId) {
    try {
      const store = getDataStore();
      const finalStatus = normalizedResult.success ? TaskStatus.COMPLETED : TaskStatus.FAILED;

      // Check if this is a video output and save to artifacts
      if (finalStructuredResult?.result_type === 'video' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        let videoUrl = content.videoUrl || content.url || content.path;

        if (videoUrl) {
          // Normalize the path: ensure it's a relative path without leading slash
          // and includes videos/ prefix if it's a local file
          if (videoUrl.startsWith('/')) {
            videoUrl = videoUrl.substring(1); // Remove leading slash
          }
          if (!videoUrl.startsWith('videos/') && !videoUrl.startsWith('outputs/')) {
            videoUrl = 'videos/' + videoUrl; // Add videos/ prefix
          }

          await store.addArtifact({
            taskId,
            artifactType: 'video',
            action: 'generated',
            path: videoUrl,
            // 优先使用 content.description，否则使用完整的 task（不截断）
            description: content.description || `Video generated: ${task}`,
            timestamp: new Date(),
          });
        }
      }

      // Also check if output contains video paths (for skills that don't use unified format)
      // This handles cases where the skill returns plain text with embedded video paths
      // Skip this if we already processed the video from structured result (to avoid duplicates)
      const hasStructuredVideo = finalStructuredResult?.result_type === 'video' && finalStructuredResult.content;

      if (!hasStructuredVideo && normalizedResult.output && typeof normalizedResult.output === 'string') {
        // Find all unique video paths using regex
        const videoPattern = /videos\/[\w-]+_video_(\d+)\.mp4/g;
        let match;
        const uniquePaths = new Map<string, number>(); // path -> number

        while ((match = videoPattern.exec(normalizedResult.output)) !== null) {
          const path = match[0];
          const number = parseInt(match[1], 10); // match[1] 是第一个捕获组
          // 使用 Map 自动去重，保留唯一的路径
          uniquePaths.set(path, number);
        }

        if (uniquePaths.size > 0) {
          for (const [videoPath, videoNumber] of uniquePaths.entries()) {
            try {
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
            } catch (error: any) {
              logger.error('Failed to save video artifact', {
                taskId,
                videoPath,
                error: error.message,
              });
            }
          }
        }
      }

      // 检查是否是 code output 并保存到 artifacts
      if (finalStructuredResult?.result_type === 'code' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        const code = content.code;
        const language = content.language || 'text';

        if (code) {
          // 生成唯一标识符作为 path
          const filename = `code_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${language}`;
          const artifactPath = `codes/${filename}`;

          // 确保目录存在
          const codesDir = join(process.cwd(), 'outputs', 'codes');
          if (!existsSync(codesDir)) {
            await mkdir(codesDir, { recursive: true });
          }

          // 将代码内容写入文件
          const filePath = join(codesDir, filename);
          await writeFile(filePath, code, 'utf-8');

          logger.info('Code artifact saved to file', {
            taskId,
            filename,
            language,
            codeLength: code.length,
            filePath,
          });

          await store.addArtifact({
            taskId,
            artifactType: 'code',
            action: 'generated',
            path: artifactPath,
            // 使用当前轮次的用户输入作为描述，而不是 skill 返回的 description
            description: task || content.description || `Generated ${language} code`,
            metadata: {
              // 使用 metadata 存储扩展属性
              language: language,
              codeLength: code.length,
              ...(content.highlight && { highlight: content.highlight }),
            },
            timestamp: new Date(),
          });
        }
      }

      // Check if this is an infographic output and save to artifacts
      if (finalStructuredResult?.result_type === 'infographic' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        const infographicPath = content.path;
        const title = content.title || finalStructuredResult.title;
        const template = content.template;
        const chartType = content.chart_type;

        if (infographicPath) {
          // Normalize the path: ensure it's a relative path with outputs/ prefix
          let normalizedPath = infographicPath;
          if (normalizedPath.startsWith('/')) {
            normalizedPath = normalizedPath.substring(1); // Remove leading slash
          }
          if (!normalizedPath.startsWith('outputs/')) {
            normalizedPath = 'outputs/' + normalizedPath; // Add outputs/ prefix
          }

          await store.addArtifact({
            taskId,
            artifactType: 'image',
            action: 'generated',
            path: normalizedPath,
            // 使用当前轮次的用户输入作为描述，而不是 skill 返回的 title
            // 这样在多轮对话时，description 会准确反映用户的实际请求
            description: task || title || `Infographic: ${template} (${chartType})`,
            metadata: {
              template: template,
              chartType: chartType,
              style: content.style,
              dimensions: content.dimensions ? `${content.dimensions.width}x${content.dimensions.height}` : undefined,
              size: content.size,
              mimeType: content.mime_type,
            },
            timestamp: new Date(),
          });
        }
      }

      // Check if this is a table output and save to artifacts
      if (finalStructuredResult?.result_type === 'table' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        const title = content.title || finalStructuredResult.title;
        const columns = content.columns || content.headers || [];
        const rows = content.rows || [];
        const rowCount = rows.length;

        // Generate a unique artifact ID for the table
        const artifactPath = `table_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.json`;

        await store.addArtifact({
          taskId,
          artifactType: 'table',
          action: 'generated',
          path: artifactPath,
          description: task || title || `Table with ${rowCount} rows`,
          metadata: {
            columnCount: columns.length,
            rowCount,
            columns: columns,
            title: title,
            // Store table data inline in metadata for easy access
            tableData: {
              columns,
              rows,
              title,
            },
          },
          timestamp: new Date(),
        });
      }

      // Check if this is an audio output and save to artifacts
      if (finalStructuredResult?.result_type === 'audio' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        let audioPath = content.path || content.audioUrl || content.url;

        if (audioPath) {
          // Normalize the path: ensure it's a relative path without leading slash
          if (audioPath.startsWith('/')) {
            audioPath = audioPath.substring(1);
          }
          if (!audioPath.startsWith('audios/') && !audioPath.startsWith('audio/')) {
            audioPath = `audios/${audioPath}`;
          }

          await store.addArtifact({
            taskId,
            artifactType: 'audio',
            action: 'generated',
            path: audioPath,
            description: finalStructuredResult.title || task || `Audio generated: ${task}`,
            metadata: {
              mimeType: content.mime_type || content.mimeType || 'audio/wav',
              size: content.size,
              duration: content.duration,
              sampleRate: content.sample_rate || content.sampleRate,
              channels: content.channels,
              ...(content.engine && { engine: content.engine }),
              ...(content.voice && { voice: content.voice }),
              ...(content.lang && { lang: content.lang }),
              ...(content.speed && { speed: content.speed }),
            },
            timestamp: new Date(),
          });
        }
      }

      // Check if this is a multi-turn continuation (task already completed)
      const currentTask = await store.getTask(taskId);
      const isMultiTurnContinuation = currentTask?.status === TaskStatus.COMPLETED;

      if (isMultiTurnContinuation) {
        // Multi-turn continuation: don't overwrite output field
        // This preserves the first round's text output while adding video artifacts
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
      } else {
        // First round or new task: update normally
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
        const current = history || [];

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
