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
 * Normalize artifact path for storage.
 * - Absolute paths (starting with /): keep as-is for media-serve to handle
 * - Relative paths: ensure they have the appropriate prefix based on type
 */
function normalizeArtifactPath(rawPath: string, artifactType: string): string {
  if (!rawPath) return rawPath;

  // If it's an absolute path (starts with /), keep it unchanged
  // media-serve will handle it correctly by trying the absolute path first
  if (rawPath.startsWith('/')) {
    return rawPath;
  }

  // For relative paths, ensure they have the appropriate prefix
  const typePrefixes: Record<string, string[]> = {
    video: ['videos/', 'outputs/videos/'],
    audio: ['audios/', 'outputs/audios/', 'audio/', 'outputs/audio/'],
    image: ['outputs/infographics/', 'infographics/', 'outputs/images/', 'images/'],
    code: ['outputs/codes/', 'codes/'],
  };

  const validPrefixes = typePrefixes[artifactType] || [];
  const hasValidPrefix = validPrefixes.some(prefix => rawPath.startsWith(prefix));

  if (!hasValidPrefix) {
    const defaultPrefix = validPrefixes[0] || `${artifactType}s/`;
    return `${defaultPrefix}${rawPath}`;
  }

  return rawPath;
}

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
     * Message ID for tracking conversation messages.
     * Links outputs and artifacts to specific messages in external systems (e.g., MyEcho).
     */
    messageId: z.string().optional(),

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
 *
 * Also pushes processed results to taskResult stream for real-time frontend updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: z.infer<typeof inputSchema>, { logger, state, streams }: any) => {
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
        structuredOutputs: (input.result as any)?.structuredOutputs, // Extract structuredOutputs
      };

  // 调试：打印原始 input.result 的结构化输出信息
  if (!isFailedEvent && input.result) {
    const resultAny = input.result as any;
    logger.info('[DEBUG] Raw input.result structured outputs', {
      taskId: input.taskId,
      'input.result.structuredOutput': !!resultAny?.structuredOutput,
      'input.result.structuredOutputs': Array.isArray(resultAny?.structuredOutputs) ? resultAny.structuredOutputs.length : 'not array',
      'input.result.structuredOutputs length': resultAny?.structuredOutputs?.length,
    });
  }

  const taskId = input.taskId;
  const task = input.task || 'Unknown task';
  const sessionId = input.sessionId;
  const messageId = input.messageId;  // Extract messageId for tracking

  // Log messageId for debugging (always log to see if it's present)
  logger.info('Task Result Handler: Received input', {
    taskId,
    messageId: messageId || 'NOT PROVIDED',
    hasMessageId: !!messageId,
  });

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
  const structuredOutputs = (normalizedResult as any).structuredOutputs || [];
  const structuredResult = parseUnifiedResult(normalizedResult.output);

  logger.info('Structured outputs found', {
    taskId,
    structuredOutputsCount: structuredOutputs.length,
    structuredOutputResultType: structuredOutput?.result_type,
  });

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

      // Check if task is awaiting clarification (HITL checkpoint)
      const isAwaitingClarification = normalizedResult.error === 'AWAITING_CLARIFICATION' ||
                                     (normalizedResult.metadata as any)?.hitl === true;

      const finalStatus = isAwaitingClarification
        ? TaskStatus.AWAITING_CLARIFICATION
        : (normalizedResult.success ? TaskStatus.COMPLETED : TaskStatus.FAILED);

      // 获取当前对话轮次（用于 artifacts 的 conversation_round metadata）
      // 使用现有 artifacts 数量来确定轮次（最可靠的方式）
      // 每个 round 产生一个 text artifact，所以 artifacts 数量 = 当前轮次 + 1
      const existingArtifacts = await store.getArtifacts(taskId);
      const artifactRound = existingArtifacts.length;

      logger.info('Current conversation round', {
        taskId,
        artifactRound,
        existingArtifactsCount: existingArtifacts.length,
        stateConversationLength: (normalizedResult as any).state?.conversationLength,
      });

      // Extract skill name from result.metadata.skillNames (populated by PTC generator)
      // skillNames is an array - for multi-skill execution, each skill output should use its corresponding name
      const skillNames = (normalizedResult.metadata as any)?.skillNames as string[] || undefined;

      // ========== 处理所有 structured outputs（多 skill 执行） ==========
      // 当有多个 skill 在一轮 PTC 代码中执行时，每个 skill 都会产生一个 structured output
      // 我们需要为每个 skill output 创建对应的 artifact，并使用正确的 skill name
      if (structuredOutputs && structuredOutputs.length > 0) {
        logger.info('Processing multiple structured outputs', {
          taskId,
          count: structuredOutputs.length,
          skillNames,
        });

        // 找出每个 skill 的最后一个 structured output（按 skill_name 分组，取每组最后一个）
        const skillGroups: Map<string, number[]> = new Map();
        for (let i = 0; i < structuredOutputs.length; i++) {
          const structuredResult = structuredOutputs[i];
          const skillName = structuredResult?.metadata?.skill_name || skillNames?.[i] || skillNames?.[0] || 'unknown';
          if (!skillGroups.has(skillName)) {
            skillGroups.set(skillName, []);
          }
          skillGroups.get(skillName)!.push(i);
        }

        // 获取每个 skill 的最后一个 output 索引
        const lastOutputIndices = new Set<number>();
        skillGroups.forEach((indices) => {
          lastOutputIndices.add(indices[indices.length - 1]);
        });

        // 获取最后一个 skill 的名称（该 skill 的产物是本轮的最终产物）
        const lastSkillName = skillNames?.[skillNames.length - 1];
        const lastSkillLastOutputIndices = lastSkillName ? skillGroups.get(lastSkillName) || [] : [];
        const finalArtifactIndex = lastSkillLastOutputIndices.length > 0
          ? lastSkillLastOutputIndices[lastSkillLastOutputIndices.length - 1]
          : -1;

        for (let i = 0; i < structuredOutputs.length; i++) {
          const structuredResult = structuredOutputs[i];
          const resultType = structuredResult?.result_type;
          const content = structuredResult?.content;

          // 优先使用 structured output 自带的 skill_name，否则按索引映射
          const skillName = structuredResult?.metadata?.skill_name || skillNames?.[i] || skillNames?.[0];

          // 判断是否是本轮的最终产物（skill 调用链中最后一个 skill 的产物）
          const isFinalArtifact = i === finalArtifactIndex;

          logger.info(`Processing structured output ${i + 1}/${structuredOutputs.length}`, {
            resultType,
            skillName,
            isFinalArtifact,
          });

          // 处理 video 类型
          if (resultType === 'video' && content) {
            let videoUrl = content.videoUrl || content.url || content.path;
            if (videoUrl) {
              videoUrl = normalizeArtifactPath(videoUrl, 'video');
              await store.addArtifact({
                taskId,
                messageId,
                artifactType: 'video',
                action: 'generated',
                path: videoUrl,
                description: content.description || `Video generated: ${task}`,
                metadata: {
                  conversation_round: artifactRound,
                  skill_name: skillName,
                  is_final: isFinalArtifact,
                },
                timestamp: new Date(),
              });
              logger.info('✅ Video artifact added from structured outputs', { videoUrl, skillName });
            }
          }

          // 处理 audio 类型
          if (resultType === 'audio' && content) {
            let audioPath = content.path || content.audioUrl || content.url;
            if (audioPath) {
              audioPath = normalizeArtifactPath(audioPath, 'audio');
              await store.addArtifact({
                taskId,
                messageId,
                artifactType: 'audio',
                action: 'generated',
                path: audioPath,
                description: structuredResult.title || task || `Audio generated: ${task}`,
                metadata: {
                  conversation_round: artifactRound,
                  skill_name: skillName,
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
              logger.info('✅ Audio artifact added from structured outputs', { audioPath, skillName });
            }
          }

          // 处理 code 类型
          if (resultType === 'code' && content) {
            const code = content.code;
            const language = content.language || 'text';
            if (code) {
              const filename = `code_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${language}`;
              const artifactPath = `codes/${filename}`;
              const codesDir = join(process.cwd(), 'outputs', 'codes');
              if (!existsSync(codesDir)) {
                await mkdir(codesDir, { recursive: true });
              }
              const filePath = join(codesDir, filename);
              await writeFile(filePath, code, 'utf-8');

              await store.addArtifact({
                taskId,
                messageId,
                artifactType: 'code',
                action: 'generated',
                path: artifactPath,
                description: task || content.description || `Generated ${language} code`,
                metadata: {
                  conversation_round: artifactRound,
                  skill_name: skillName,
                  language: language,
                  codeLength: code.length,
                  is_final: true, // Mark as final artifact for display in UI
                  ...(content.highlight && { highlight: content.highlight }),
                },
                timestamp: new Date(),
              });
              logger.info('✅ Code artifact added from structured outputs', { artifactPath, skillName });
            }
          }

          // 处理 image/infographic 类型
          if (resultType === 'infographic' && content) {
            const infographicPath = content.path;
            const title = content.title || structuredResult.title;
            if (infographicPath) {
              const normalizedPath = normalizeArtifactPath(infographicPath, 'image');
              await store.addArtifact({
                taskId,
                messageId,
                artifactType: 'image',
                action: 'generated',
                path: normalizedPath,
                description: task || title || `Infographic: ${content.template} (${content.chart_type})`,
                metadata: {
                  conversation_round: artifactRound,
                  skill_name: skillName,
                  template: content.template,
                  chartType: content.chart_type,
                  style: content.style,
                  dimensions: content.dimensions ? `${content.dimensions.width}x${content.dimensions.height}` : undefined,
                  size: content.size,
                  mimeType: content.mime_type,
                  is_final: true, // Mark as final artifact for display in UI
                },
                timestamp: new Date(),
              });
              logger.info('✅ Image artifact added from structured outputs', { normalizedPath, skillName });
            }
          }

          // 处理 table 类型
          if (resultType === 'table' && content) {
            const columns = content.columns || content.headers || [];
            const rows = content.rows || [];
            const rowCount = rows.length;
            const artifactPath = `table_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.json`;

            await store.addArtifact({
              taskId,
              messageId,
              artifactType: 'table',
              action: 'generated',
              path: artifactPath,
              description: task || content.title || `Table with ${rowCount} rows`,
              metadata: {
                conversation_round: artifactRound,
                skill_name: skillName,
                columnCount: columns.length,
                rowCount,
                columns: columns,
                title: content.title,
                tableData: { columns, rows, title: content.title },
              },
              timestamp: new Date(),
            });
            logger.info('✅ Table artifact added from structured outputs', { artifactPath, skillName });
          }

          // 处理 text 类型
          // 如果有 output_files，优先创建 file 类型的 artifact（而不是 text）
          const outputFiles = structuredResult?.output_files as Array<{type: string; 'file-type': string; path: string}> | undefined;
          if (outputFiles && outputFiles.length > 0 && resultType === 'text') {
            // Create file artifacts for each output file
            // 对于多 skill 场景，同一文件可能被多个 skill 处理，只保留一个 artifact（最后一个）
            for (const file of outputFiles) {
              const fileType = file['file-type'] || 'unknown';
              const filePath = file.path;

              // 检查是否已存在相同路径的 artifact
              const existingArtifacts = await store.getArtifacts(taskId);
              const existingArtifact = existingArtifacts.find((a: any) => a.path === filePath && a.artifact_type === 'file');

              if (existingArtifact) {
                // 更新现有 artifact（保留最后一个 skill 的信息）
                await store.updateArtifact(existingArtifact.id, {
                  artifactType: 'file',
                  action: 'generated',
                  path: filePath,
                  description: `File output: ${filePath.split('/').pop()}`,
                  metadata: {
                    conversation_round: artifactRound,
                    skill_name: skillName,
                    is_final: isFinalArtifact,
                    file_type: fileType,
                    originalTask: task,
                    mimeType: `application/${fileType}`,
                  },
                  timestamp: new Date(),
                });
                logger.info('✅ File artifact updated from output_files', { filePath, fileType, skillName, artifactId: existingArtifact.id });
              } else {
                // 创建新 artifact
                await store.addArtifact({
                  taskId,
                  messageId,
                  artifactType: 'file',
                  action: 'generated',
                  path: filePath,
                  description: `File output: ${filePath.split('/').pop()}`,
                  metadata: {
                    conversation_round: artifactRound,
                    skill_name: skillName,
                    is_final: isFinalArtifact,
                    file_type: fileType,
                    originalTask: task,
                    mimeType: `application/${fileType}`,
                  },
                  timestamp: new Date(),
                });
                logger.info('✅ File artifact added from output_files', { filePath, fileType, skillName });
              }
            }
          } else if (resultType === 'text' && content) {
            const textContent = typeof content === 'string' ? content : content.text || content.message || content.content || '';

            if (textContent.trim()) {
              const artifactId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

              // Extract preview from text content for description (first 100 chars)
              let preview = textContent;
              try {
                const parsed = JSON.parse(textContent);
                if (parsed.message) {
                  preview = parsed.message;
                } else if (parsed.output) {
                  preview = parsed.output;
                }
              } catch {
                // Not JSON, use raw text
              }
              const description = preview.length > 100 ? preview.substring(0, 100) + '...' : preview;

              await store.addArtifact({
                taskId,
                messageId,
                artifactType: 'text',
                action: 'generated',
                path: artifactId,
                description: description,
                metadata: {
                  conversation_round: artifactRound,
                  skill_name: skillName,
                  is_final: isFinalArtifact,
                  originalTask: task,
                  textContent: textContent,
                  contentLength: textContent.length,
                  mimeType: 'text/plain',
                },
                timestamp: new Date(),
              });
              logger.info('✅ Text artifact added from structured outputs', { artifactId, skillName });
            }
          }

          // 处理没有 result_type 的情况（纯文本输出）
          if (!resultType && content && typeof content === 'string' && content.trim()) {
            const artifactId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            // Extract preview from text content for description (first 100 chars)
            let preview = content;
            try {
              const parsed = JSON.parse(content);
              if (parsed.message) {
                preview = parsed.message;
              } else if (parsed.output) {
                preview = parsed.output;
              }
            } catch {
              // Not JSON, use raw text
            }
            const description = preview.length > 100 ? preview.substring(0, 100) + '...' : preview;

            await store.addArtifact({
              taskId,
              messageId,
              artifactType: 'text',
              action: 'generated',
              path: artifactId,
              description: description,
              metadata: {
                conversation_round: artifactRound,
                skill_name: skillName,
                is_final: isFinalArtifact,
                originalTask: task,
                textContent: content,
                contentLength: content.length,
                mimeType: 'text/plain',
              },
              timestamp: new Date(),
            });
            logger.info('✅ Text artifact added from structured outputs (implicit type)', { artifactId, skillName });
          }
        }

        logger.info('✅ All structured outputs processed', {
          taskId,
          totalProcessed: structuredOutputs.length,
        });
      }
      // ========== 结束处理所有 structured outputs ==========

      // 向后兼容：如果没有 structuredOutputs 数组，使用旧的逻辑处理 finalStructuredResult
      const extractedSkillName = skillNames && skillNames.length > 0 ? skillNames[0] : undefined;

      // Check if this is a video output and save to artifacts
      if (structuredOutputs.length === 0 && finalStructuredResult?.result_type === 'video' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        let videoUrl = content.videoUrl || content.url || content.path;

        if (videoUrl) {
          // Normalize path using the common function
          videoUrl = normalizeArtifactPath(videoUrl, 'video');

          await store.addArtifact({
            taskId,
            messageId,
            artifactType: 'video',
            action: 'generated',
            path: videoUrl,
            // 优先使用 content.description，否则使用完整的 task（不截断）
            description: content.description || `Video generated: ${task}`,
            metadata: {
              conversation_round: artifactRound,
              skill_name: extractedSkillName,
            },
            timestamp: new Date(),
          });
        }
      }

      // Also check if output contains video paths (for skills that don't use unified format)
      // This handles cases where the skill returns plain text with embedded video paths
      // Skip this if we already processed the video from structured result (to avoid duplicates)
      // Also skip if we have structuredOutputs array (already processed above)
      const hasStructuredVideo = finalStructuredResult?.result_type === 'video' && finalStructuredResult.content;
      const hasStructuredOutputs = structuredOutputs && structuredOutputs.length > 0;

      if (!hasStructuredVideo && !hasStructuredOutputs && normalizedResult.output && typeof normalizedResult.output === 'string') {
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
                messageId,
                artifactType: 'video',
                action: 'generated',
                path: videoPath,
                description: `Video ${videoNumber}: ${taskDesc}`,
                metadata: {
                  conversation_round: artifactRound,
                },
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
      // Skip if we have structuredOutputs array (already processed above)
      if (!hasStructuredOutputs && finalStructuredResult?.result_type === 'code' && finalStructuredResult.content) {
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
            messageId,
            artifactType: 'code',
            action: 'generated',
            path: artifactPath,
            // 使用当前轮次的用户输入作为描述，而不是 skill 返回的 description
            description: task || content.description || `Generated ${language} code`,
            metadata: {
              // 使用 metadata 存储扩展属性
              conversation_round: artifactRound,
              skill_name: extractedSkillName,
              language: language,
              codeLength: code.length,
              is_final: true, // Mark as final artifact for display in UI
              ...(content.highlight && { highlight: content.highlight }),
            },
            timestamp: new Date(),
          });
        }
      }

      // Check if this is an infographic output and save to artifacts
      // Skip if we have structuredOutputs array (already processed above)
      if (!hasStructuredOutputs && finalStructuredResult?.result_type === 'infographic' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        const infographicPath = content.path;
        const title = content.title || finalStructuredResult.title;
        const template = content.template;
        const chartType = content.chart_type;

        if (infographicPath) {
          // Normalize path using the common function
          const normalizedPath = normalizeArtifactPath(infographicPath, 'image');

          await store.addArtifact({
            taskId,
            messageId,
            artifactType: 'image',
            action: 'generated',
            path: normalizedPath,
            // 使用当前轮次的用户输入作为描述，而不是 skill 返回的 title
            // 这样在多轮对话时，description 会准确反映用户的实际请求
            description: task || title || `Infographic: ${template} (${chartType})`,
            metadata: {
              conversation_round: artifactRound,
              skill_name: extractedSkillName,
              template: template,
              chartType: chartType,
              style: content.style,
              dimensions: content.dimensions ? `${content.dimensions.width}x${content.dimensions.height}` : undefined,
              size: content.size,
              mimeType: content.mime_type,
              is_final: true, // Mark as final artifact for display in UI
            },
            timestamp: new Date(),
          });
        }
      }

      // Check if this is a table output and save to artifacts
      // Skip if we have structuredOutputs array (already processed above)
      if (!hasStructuredOutputs && finalStructuredResult?.result_type === 'table' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        const title = content.title || finalStructuredResult.title;
        const columns = content.columns || content.headers || [];
        const rows = content.rows || [];
        const rowCount = rows.length;

        // Generate a unique artifact ID for the table
        const artifactPath = `table_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.json`;

        await store.addArtifact({
          taskId,
          messageId,
          artifactType: 'table',
          action: 'generated',
          path: artifactPath,
          description: task || title || `Table with ${rowCount} rows`,
          metadata: {
            conversation_round: artifactRound,
            skill_name: extractedSkillName,
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
      // Skip if we have structuredOutputs array (already processed above)
      if (!hasStructuredOutputs && finalStructuredResult?.result_type === 'audio' && finalStructuredResult.content) {
        const content = finalStructuredResult.content as any;
        let audioPath = content.path || content.audioUrl || content.url;

        if (audioPath) {
          // Normalize path using the common function
          audioPath = normalizeArtifactPath(audioPath, 'audio');

          await store.addArtifact({
            taskId,
            messageId,
            artifactType: 'audio',
            action: 'generated',
            path: audioPath,
            description: finalStructuredResult.title || task || `Audio generated: ${task}`,
            metadata: {
              conversation_round: artifactRound,
              skill_name: extractedSkillName,
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

      // Check if this is a text output and save to artifacts
      // This enables multi-round text results to be viewed in dropdown (similar to video artifacts)
      // Skip if we have structuredOutputs array (already processed above)
      if (!hasStructuredOutputs && normalizedResult.output && typeof normalizedResult.output === 'string') {
        // Check if this is a pure text output (no specific result_type or result_type is 'text')
        const resultType = finalStructuredResult?.result_type;
        const isTextOutput = !resultType || resultType === 'text';

        if (isTextOutput) {
          // Generate a unique artifact ID for the text output
          const artifactId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const textContent = normalizedResult.output;

          // Only save if the output is not empty and not just a placeholder
          if (textContent.trim() && textContent !== 'AI is thinking...' && textContent.length > 0) {
            // Extract preview from text content for description
            // Try to parse JSON and extract the message field, otherwise use first 100 chars
            let preview = textContent;
            try {
              const parsed = JSON.parse(textContent);
              if (parsed.message) {
                preview = parsed.message;
              } else if (parsed.output) {
                preview = parsed.output;
              }
            } catch {
              // Not JSON, use raw text
            }
            // Truncate preview to 100 characters for description
            const description = preview.length > 100 ? preview.substring(0, 100) + '...' : preview;

            await store.addArtifact({
              taskId,
              messageId,
              artifactType: 'text',
              action: 'generated',
              path: artifactId, // Use artifactId as path (text is stored inline in metadata)
              description: description,
              metadata: {
                conversation_round: artifactRound,
                skill_name: extractedSkillName,
                is_final: true, // Mark as final artifact for display in UI
                // Store the original task in metadata for reference
                originalTask: task,
                // Store text content inline in metadata for easy access
                textContent: textContent,
                contentLength: textContent.length,
                mimeType: 'text/plain',
              },
              timestamp: new Date(),
            });
            logger.info('✅ Text artifact added', {
              taskId,
              artifactId,
              artifactRound,
              contentLength: textContent.length,
            });
          }
        }
      }

      // Check if this is a multi-turn continuation (task already completed)
      const currentTask = await store.getTask(taskId);
      const isMultiTurnContinuation = currentTask?.status === TaskStatus.COMPLETED;

      // ==================== 保存对话轮次 ====================
      // ⭐ 注意：ConversationRound 现在由 ContextManagerTaskHook.postExec 保存
      // 这里不再重复保存，避免数据不一致
      // ==================== 结束保存对话轮次 ====================

      if (isMultiTurnContinuation) {
        // Multi-turn continuation: update output field to latest response
        // This ensures myecho-backend can get the latest round's result
        await store.updateTask(taskId, {
          // CRITICAL: Always set status to completed after successful execution
          // This ensures the task status is correct even in multi-turn conversations
          status: finalStatus,
          // Update output to latest response (this is what myecho-backend reads)
          output: normalizedResult.output,
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
        logger.info('Task updated for multi-turn continuation', {
          taskId,
          outputLength: normalizedResult.output?.length || 0,
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

  // ========== Push to taskResult Stream for real-time updates ==========
  try {
    // Get store instance
    const unifiedStore = getDataStore();

    // Get the complete task data from database (same as /agent/result API)
    const finalTask = await unifiedStore.getTask(taskId);

    if (finalTask) {
      // Get all artifacts for this task
      const finalArtifacts = await unifiedStore.getArtifacts(taskId);

      // Map artifacts to match API format
      const artifactsForStream = finalArtifacts.map((artifact: any) => ({
        id: artifact.id,
        type: artifact.artifactType,
        action: artifact.action,
        path: artifact.path,
        description: artifact.description,
        metadata: artifact.metadata,
        timestamp: artifact.timestamp instanceof Date
          ? artifact.timestamp.toISOString()
          : new Date(artifact.timestamp).toISOString(),
      }));

      // Determine success based on status
      const taskSuccess = finalTask.status === 'completed';

      // Prepare metadata (parse if needed - same logic as API)
      let parsedMetadata = finalTask.metadata;
      if (typeof parsedMetadata === 'string') {
        try {
          parsedMetadata = JSON.parse(parsedMetadata);
        } catch (error) {
          console.warn('[TaskResultHandler] Failed to parse metadata as JSON:', error);
          parsedMetadata = {};
        }
      }

      // Push to taskResult stream with the same format as /agent/result API
      // Use taskId as groupId - frontend subscribes with: stream.subscribeGroup('taskResult', taskId)
      await streams.taskResult.set(taskId, taskId, {
        taskId: finalTask.id,
        task: finalTask.task,
        sessionId: finalTask.sessionId,
        app: finalTask.app,
        success: taskSuccess,
        status: finalTask.status,
        output: finalTask.output,
        error: finalTask.error,
        executionTime: finalTask.executionTime,
        structuredOutput: (finalTask as any).structuredOutput,
        metadata: parsedMetadata,
        artifacts: artifactsForStream,
        pinned: finalTask.pinned || false,
        messageId: messageId,  // ← Include messageId in taskResult for MyEcho matching
        timestamp: finalTask.createdAt instanceof Date
          ? finalTask.createdAt.toISOString()
          : new Date(finalTask.createdAt).toISOString(),
      });

      logger.info('✅ Task result pushed to stream', {
        taskId,
        sessionId,
        status: finalTask.status,
        artifactsCount: artifactsForStream.length,
      });
    } else {
      logger.warn('Task not found in database when trying to push to stream', { taskId });
    }
  } catch (error: any) {
    // Don't fail the handler if stream push fails
    logger.error('Failed to push task result to stream', {
      error: error.message,
      taskId,
    });
  }
  // ========== End Stream Push ==========

  return {
    logged: true,
    timestamp,
    task,
  };
};
