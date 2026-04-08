/**
 * ExternalAgent - Agent that delegates to external coding agents via ACP protocol.
 *
 * This agent uses acpx runtime to communicate with external agents.
 */

import { Agent } from './agent';
import { AgentConfig, AgentResult, ExternalAgentConfig } from './types';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ContextManager } from '../context/manager';

/**
 * ExternalAgent class.
 *
 * Uses acpx's AcpRuntime to communicate with external agents.
 */
export class ExternalAgent extends Agent {
  private acpRuntime: any = null;
  private runtimeHandle: any = null;
  private externalConfig: ExternalAgentConfig['externalAgent'];
  private currentWorkspace: string | null = null; // 当前使用的 workspace

  constructor(config: ExternalAgentConfig, sessionId: string) {
    // Initialize base Agent with minimal config
    const baseConfig: AgentConfig = {
      systemPrompt: config.systemPrompt || 'External Agent',
      availableSkills: [],
      sandbox: {
        type: 'local',
        local: {},
      },
      llm: {
        provider: 'anthropic',
        model: 'unused',
        apiKey: 'unused',
      },
    };

    super(baseConfig, sessionId);

    if (!config.externalAgent) {
      throw new Error('ExternalAgent requires externalAgent configuration');
    }

    this.externalConfig = config.externalAgent;
    console.log(`[ExternalAgent ${sessionId}] Initialized with config:`, {
      type: this.externalConfig.type,
      protocol: this.externalConfig.protocol || 'acp',
      timeout: this.externalConfig.timeout || 300000,
    });
  }

  /**
   * Initialize acpx runtime.
   */
  private async initializeRuntime(): Promise<void> {
    if (this.acpRuntime) {
      console.log(`[ExternalAgent ${this.sessionId}] Runtime already initialized`);
      return;
    }

    try {
      // Set PATH to include npx
      const originalPath = process.env.PATH || '';
      const homebrewPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
      if (!originalPath.includes(homebrewPath.split(':')[0])) {
        process.env.PATH = `${homebrewPath}:${originalPath}`;
      }

      // Import acpx runtime
      const { createAcpRuntime, createAgentRegistry, createFileSessionStore } = await import('acpx/runtime');

      console.log(`[ExternalAgent ${this.sessionId}] Creating AcpRuntime...`);

      // Create file session store
      const sessionStore = createFileSessionStore({
        stateDir: '/tmp/acpx-sessions',
      });

      // Create agent registry
      const agentRegistry = createAgentRegistry({
        overrides: {
          [this.externalConfig.type]: this.buildAgentCommand(),
        },
      });

      // Create runtime with current workspace
      this.acpRuntime = createAcpRuntime({
        cwd: this.currentWorkspace || this.externalConfig.workingDirectory || process.cwd(),
        sessionStore,
        agentRegistry,
        permissionMode: 'approve-all',
        timeoutMs: this.externalConfig.timeout || 300000,
        verbose: true,
      });

      console.log(`[ExternalAgent ${this.sessionId}] AcpRuntime created successfully`);

      // Ensure session
      console.log(`[ExternalAgent ${this.sessionId}] Ensuring session...`);
      this.runtimeHandle = await this.acpRuntime.ensureSession({
        sessionKey: this.sessionId,
        agent: this.externalConfig.type,
        mode: 'oneshot',
        cwd: this.currentWorkspace,
      });

      console.log(`[ExternalAgent ${this.sessionId}] Session ensured:`, {
        sessionKey: this.runtimeHandle.sessionKey,
        backendSessionId: this.runtimeHandle.backendSessionId,
      });

    } catch (error: any) {
      console.error(`[ExternalAgent ${this.sessionId}] Failed to initialize runtime:`, error);
      throw new Error(`Failed to initialize external agent: ${error.message}`);
    }
  }

  /**
   * Parse tool_call event to extract file operation information.
   */
  private parseToolCallEvent(event: any): any | null {
    try {
      // 检查是否是文件相关的工具调用
      const title = event.title || '';
      const text = event.text || '';
      const status = event.status || 'unknown';

      // 提取文件路径
      // 格式示例: "Write /private/tmp/test-toolcall/test.txt"
      // 或 "Edit /path/to/file.txt"
      const pathMatch = text.match(/(?:Write|Edit|Read|Create)\s+([/\w\-_.]+)/);
      const filePath = pathMatch ? pathMatch[1] : null;

      if (!filePath) {
        return null; // 不是文件操作
      }

      // 确定操作类型
      let operationType = 'unknown';
      if (title.includes('Write') || text.includes('Write')) {
        operationType = 'write';
      } else if (title.includes('Edit') || text.includes('Edit')) {
        operationType = 'edit';
      } else if (title.includes('Read') || text.includes('Read')) {
        operationType = 'read';
      } else if (title.includes('Create') || text.includes('Create')) {
        operationType = 'create';
      }

      return {
        type: operationType,
        path: filePath,
        status: status,
        toolCallId: event.toolCallId,
        title: title,
        rawText: text,
      };
    } catch (error) {
      console.error(`[ExternalAgent ${this.sessionId}] Failed to parse tool_call event:`, error);
      return null;
    }
  }

  /**
   * Resolve workspace directory for this task.
   *
   * Priority:
   * 1. context.environment.workspace (dynamic, per-task)
   * 2. context.environment.workingDirectory (dynamic, per-task)
   * 3. externalAgent.workingDirectory (static, from config)
   * 4. Default workspace: /tmp/myagent-workspace (shared default)
   * 5. Create temporary directory (fallback, auto-generated)
   */
  private resolveWorkspace(context?: any): string {
    console.log(`[ExternalAgent ${this.sessionId}] Resolving workspace`, {
      hasContext: !!context,
      hasEnvironment: !!context?.environment,
      envWorkspace: context?.environment?.workspace,
      envWorkingDir: context?.environment?.workingDirectory,
      configWorkingDir: this.externalConfig.workingDirectory,
    });

    // 1. Check dynamic workspace from task context
    if (context?.environment?.workspace) {
      return context.environment.workspace;
    }

    if (context?.environment?.workingDirectory) {
      return context.environment.workingDirectory;
    }

    // 2. Use static workspace from config
    if (this.externalConfig.workingDirectory) {
      return this.externalConfig.workingDirectory;
    }

    // 3. Use default shared workspace
    const defaultWorkspace = '/tmp/myagent-workspace';

    // Ensure default workspace exists
    if (!existsSync(defaultWorkspace)) {
      mkdirSync(defaultWorkspace, { recursive: true });
      console.log(`[ExternalAgent ${this.sessionId}] Created default workspace: ${defaultWorkspace}`);
    }

    console.log(`[ExternalAgent ${this.sessionId}] Using default workspace: ${defaultWorkspace}`);
    return defaultWorkspace;

    // 4. Fallback: Create temporary workspace (should rarely reach here)
    // This is kept as a safety net, but should almost never be used
    // const tempDir = join('/tmp/myagent-workspaces', `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
    // if (!existsSync(tempDir)) {
    //   mkdirSync(tempDir, { recursive: true });
    // }
    // return tempDir;
  }

  /**
   * Build agent command based on external agent type.
   */
  private buildAgentCommand(): string {
    const { type, args = [] } = this.externalConfig!;

    // Use absolute paths to avoid PATH issues
    const npxPath = '/opt/homebrew/bin/npx';

    // Map agent type to ACP-compatible command
    // acpx uses adapter packages for some agents
    const agentCommands: Record<string, string> = {
      claude: `${npxPath} -y @agentclientprotocol/claude-agent-acp@latest`,
      codex: 'codex --acp',
      cursor: 'cursor-agent acp',
      openclaw: 'openclaw',
      pi: 'pi',
      gemini: 'gemini --acp',
    };

    const baseCommand = agentCommands[type] || type;

    // Add additional arguments
    if (args.length > 0) {
      return `${baseCommand} ${args.join(' ')}`;
    }

    return baseCommand;
  }

  /**
   * Execute a task via external agent.
   *
   * @override
   */
  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    // Resolve workspace for this task
    this.currentWorkspace = this.resolveWorkspace(context);

    console.log(`[ExternalAgent ${this.sessionId}] Executing task:`, {
      task: task.substring(0, 100),
      taskId,
      externalAgentType: this.externalConfig?.type,
      workspace: this.currentWorkspace,
    });

    try {
      // Always reinitialize runtime for oneshot mode
      // This ensures workspace changes are respected
      if (this.acpRuntime) {
        // Clean up previous runtime
        try {
          await this.acpRuntime.close({
            handle: this.runtimeHandle,
            reason: 'Reinitializing with new workspace',
          });
        } catch (error) {
          console.error(`[ExternalAgent ${this.sessionId}] Failed to close previous runtime:`, error);
        }
        this.acpRuntime = null;
        this.runtimeHandle = null;
      }

      steps.push({
        type: 'planning',
        content: 'Initializing external agent connection',
        timestamp: Date.now(),
      });

      await this.initializeRuntime();

      // Run turn
      steps.push({
        type: 'execution',
        content: `Sending task to ${this.externalConfig!.type} agent`,
        timestamp: Date.now(),
      });

      console.log(`[ExternalAgent ${this.sessionId}] Running turn...`);

      // Collect output from events
      let output = '';
      let stopReason = 'end_turn';

      const events = await this.acpRuntime.runTurn({
        handle: this.runtimeHandle,
        text: task,
        mode: 'prompt',
        requestId: taskId || `task-${Date.now()}`,
        timeoutMs: this.externalConfig.timeout || 300000,
      });

      // Process events
      const toolCalls: any[] = []; // 收集所有 tool_call 事件
      const fileOperations: any[] = []; // 提取的文件操作信息

      for await (const event of events) {
        console.log(`[ExternalAgent ${this.sessionId}] Event:`, event.type);

        if (event.type === 'text_delta') {
          output += event.text;
        } else if (event.type === 'tool_call') {
          console.log(`[ExternalAgent ${this.sessionId}] Tool call event:`, JSON.stringify(event, null, 2));
          toolCalls.push(event);

          // 解析 tool_call 事件，提取文件操作信息
          const operation = this.parseToolCallEvent(event);
          if (operation) {
            fileOperations.push(operation);
          }
        } else if (event.type === 'done') {
          stopReason = event.stopReason || 'end_turn';
          break;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      console.log(`[ExternalAgent ${this.sessionId}] Turn completed:`, {
        stopReason,
        outputLength: output.length,
        toolCallsCount: toolCalls.length,
        fileOperationsCount: fileOperations.length,
      });

      const executionTime = Date.now() - startTime;

      // Record in conversation history
      this.state.conversationHistory.push({
        role: 'assistant',
        content: output,
        timestamp: Date.now(),
      });

      // Handle different stop reasons
      if (stopReason === 'end_turn') {
        // ⭐ 检测输出中是否包含提问（即使 stopReason 是 end_turn）
        // Claude Code 有时会在正常结束时提问，而不是返回 awaiting_input
        const hasQuestion = this.detectQuestionInOutput(output);

        if (hasQuestion) {
          console.log(`[ExternalAgent ${this.sessionId}] Question detected in output, triggering HITL clarification`);

          const currentTaskId = taskId || `task-${Date.now()}`;
          const question = output; // 使用完整的输出作为问题上下文

          try {
            // 1. 保存 HITL 状态到数据库
            await this.saveHITLStateInternal(currentTaskId, {
              stage: 'in_execution',
              status: 'awaiting',
              agentName: `External Agent (${this.externalConfig!.type})`,
              question,
              options: [], // External Agent 的提问通常不是选择题
              createdAt: new Date(),
            });

            console.log(`[ExternalAgent ${this.sessionId}] HITL state saved, starting to poll`, { currentTaskId });

            // 2. 触发 Agent Hook 通知
            try {
              await this.hookManager.executeHook('onAwaitingHITL', question, [], {
                agentName: `External Agent (${this.externalConfig!.type})`,
                sessionId: this.sessionId,
                taskId: currentTaskId,
                externalAgent: this.externalConfig!.type,
              });
            } catch (hookError) {
              console.warn('[ExternalAgent] HITL hook execution failed', { error: hookError });
            }

            // 3. 轮询等待用户响应
            console.log(`[ExternalAgent ${this.sessionId}] Starting to poll for HITL response`, { currentTaskId });
            const clarificationResponse = await this.pollHITLResultInternal(currentTaskId);

            // 4. 清除 HITL 状态
            await this.clearHITLStateInternal(currentTaskId);

            console.log(`[ExternalAgent ${this.sessionId}] HITL clarification received, resuming execution`, {
              currentTaskId,
              clarification: clarificationResponse.content,
            });

            // ⭐ 发送澄清事件到 taskExecution 和 executionTraces stream
            const { getAgentStreams } = await import('../agent/hooks/progress-notify.js');
            const streams = getAgentStreams();

            // 1. 发送到 taskExecution stream
            if (streams?.taskExecution) {
              const clarificationMessage = clarificationResponse.feedback
                ? `${clarificationResponse.content}（备注：${clarificationResponse.feedback}）`
                : clarificationResponse.content;

              const clarificationEvent = {
                type: 'user_clarification',
                status: 'clarification_provided',
                taskId: currentTaskId,
                sessionId: this.sessionId,
                timestamp: new Date().toISOString(),
                data: {
                  clarification: clarificationMessage,
                  originalQuestion: question,
                  stage: 'in_execution',
                  agentType: `External Agent (${this.externalConfig!.type})`,
                }
              };

              const clarificationEntryId = `user-clarification-${currentTaskId}-${Date.now()}`;
              await streams.taskExecution.set(currentTaskId, clarificationEntryId, {
                ...clarificationEvent,
                category: 'agent_hook',
              });

              console.log('[ExternalAgent] User clarification notification sent to taskExecution', {
                currentTaskId,
                clarification: clarificationMessage,
              });
            }

            // 2. 发送到 executionTraces stream
            if (streams?.executionTraces) {
              // 开始等待澄清的 trace
              const awaitingTraceId = `awaiting-clarification-${currentTaskId}-${Date.now()}`;
              await streams.executionTraces.set(currentTaskId, awaitingTraceId, {
                traceId: awaitingTraceId,
                level: 'agent',
                taskId: currentTaskId,
                agentId: this.sessionId,
                stage: 'processing',
                purpose: 'hitl_clarification',
                status: 'started',
                inputData: JSON.stringify({
                  question: question.substring(0, 500) + (question.length > 500 ? '...' : ''),
                  timestamp: new Date().toISOString(),
                }),
              });

              console.log('[ExternalAgent] Awaiting clarification trace sent', {
                currentTaskId,
                traceId: awaitingTraceId,
              });

              // 收到澄清的 trace
              const receivedTraceId = `clarification-provided-${currentTaskId}-${Date.now()}`;
              await streams.executionTraces.set(currentTaskId, receivedTraceId, {
                traceId: receivedTraceId,
                level: 'agent',
                taskId: currentTaskId,
                agentId: this.sessionId,
                parentTraceId: awaitingTraceId,
                stage: 'processing',
                purpose: 'hitl_clarification',
                status: 'completed',
                inputData: JSON.stringify({
                  clarification: clarificationResponse.content.substring(0, 500) + (clarificationResponse.content.length > 500 ? '...' : ''),
                  timestamp: new Date().toISOString(),
                }),
              });

              console.log('[ExternalAgent] Clarification provided trace sent', {
                currentTaskId,
                traceId: receivedTraceId,
              });
            }

            // 5. 使用用户的澄清继续执行
            console.log(`[ExternalAgent ${this.sessionId}] Sending clarification to external agent`);
            const continuedResult = await this.handleHITLInput(clarificationResponse.content);

            // 6. 返回继续执行的结果
            return {
              success: continuedResult.success,
              output: continuedResult.output || clarificationResponse.content,
              steps: [...steps, ...continuedResult.steps, {
                type: 'clarification',
                content: 'User clarification received and execution resumed',
                timestamp: Date.now(),
              }],
              executionTime: Date.now() - startTime + continuedResult.executionTime,
              sessionId: this.sessionId,
              metadata: {
                externalAgent: this.externalConfig!.type,
                workspace: this.currentWorkspace,
                clarification: clarificationResponse.content,
              },
            };

          } catch (error: any) {
            console.error(`[ExternalAgent ${this.sessionId}] HITL clarification failed:`, error);
            return {
              success: false,
              error: `HITL clarification failed: ${error.message}`,
              steps,
              executionTime: Date.now() - startTime,
              sessionId: this.sessionId,
              metadata: {
                externalAgent: this.externalConfig!.type,
                hitlError: error.message,
              },
            };
          }
        }

        return {
          success: true,
          output: output,
          steps: [...steps, {
            type: 'execution',
            content: 'External agent completed task',
            timestamp: Date.now(),
            metadata: {
              stopReason,
              toolCallsCount: toolCalls.length,
              fileOperationsCount: fileOperations.length,
            },
          }],
          executionTime,
          sessionId: this.sessionId,
          metadata: {
            externalAgent: this.externalConfig!.type,
            workspace: this.currentWorkspace,
            fileOperations: fileOperations,
            toolCallsCount: toolCalls.length,
          },
        };
      } else if (stopReason === 'awaiting_input') {
        return {
          success: false,
          error: 'External agent is awaiting input (clarification needed)',
          clarification: {
            needs: true,
            question: 'The external agent needs more information to proceed.',
            stage: 'in_execution',
          },
          steps,
          executionTime,
          sessionId: this.sessionId,
          metadata: {
            externalAgent: this.externalConfig!.type,
            stopReason,
            workspace: this.currentWorkspace,
          },
        };
      } else {
        return {
          success: false,
          error: `External agent stopped: ${stopReason}`,
          steps,
          executionTime,
          sessionId: this.sessionId,
          metadata: {
            externalAgent: this.externalConfig!.type,
            stopReason,
            workspace: this.currentWorkspace,
          },
        };
      }

    } catch (error: any) {
      console.error(`[ExternalAgent ${this.sessionId}] Execution failed:`, error);

      const executionTime = Date.now() - startTime;

      return {
        success: false,
        error: error.message || 'External agent execution failed',
        steps: [...steps, {
          type: 'error',
          content: error.message,
          timestamp: Date.now(),
        }],
        executionTime,
        sessionId: this.sessionId,
        metadata: {
          externalAgent: this.externalConfig?.type,
        },
      };
    }
  }

  /**
   * Handle HITL input for external agent.
   *
   * @param input - User's clarification input
   */
  async handleHITLInput(input: string): Promise<AgentResult> {
    if (!this.acpRuntime || !this.runtimeHandle) {
      throw new Error('ExternalAgent not initialized');
    }

    console.log(`[ExternalAgent ${this.sessionId}] Sending HITL input:`, {
      input: input.substring(0, 100),
    });

    try {
      let output = '';
      let stopReason = 'end_turn';

      const events = await this.acpRuntime.runTurn({
        handle: this.runtimeHandle,
        text: input,
        mode: 'prompt',
        requestId: `hitl-${Date.now()}`,
        timeoutMs: this.externalConfig?.timeout || 300000,
      });

      for await (const event of events) {
        if (event.type === 'text_delta') {
          output += event.text;
        } else if (event.type === 'done') {
          stopReason = event.stopReason || 'end_turn';
          break;
        }
      }

      if (stopReason === 'end_turn') {
        return {
          success: true,
          output,
          steps: [{
            type: 'execution',
            content: 'External agent resumed after clarification',
            timestamp: Date.now(),
          }],
          executionTime: 0,
          sessionId: this.sessionId,
          metadata: {
            externalAgent: this.externalConfig!.type,
          },
        };
      } else {
        return {
          success: false,
          error: `External agent stopped after clarification: ${stopReason}`,
          steps: [],
          executionTime: 0,
          sessionId: this.sessionId,
          metadata: {
            externalAgent: this.externalConfig!.type,
            stopReason,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send HITL input to external agent',
        steps: [],
        executionTime: 0,
        sessionId: this.sessionId,
        metadata: {},
      };
    }
  }

  /**
   * Detect if the output contains questions requiring clarification.
   *
   * This handles the case where Claude Code asks questions in its output
   * instead of returning stopReason='awaiting_input'.
   *
   * @param output - The output text from the external agent
   * @returns true if questions are detected, false otherwise
   */
  private detectQuestionInOutput(output: string): boolean {
    if (!output || output.length < 10) {
      return false;
    }

    // Patterns that indicate questions/clarification needed
    const questionPatterns = [
      // Chinese question markers
      /请问.*/,
      /您想要.*/,
      /需要.*吗[？?]?/,
      /是否.*/,
      /哪个.*/,

      // Direct questions ending with ?
      /\?[^？]*/,  // English question mark
      /？/,       // Chinese question mark

      // Explicit clarification requests
      /请告诉我/,
      /请描述/,
      /请说明/,
      /我想了解/,

      // Multiple questions (3+ question marks)
      /\?.*\?.*\?/,

      // Short questions (less than 100 chars with question mark)
      /^.{1,100}[?？]$/,

      // Common question phrases
      /什么类型/,
      /哪个选项/,
      /如何.*\?/,
      /怎么.*\?/,
      /为什么.*\?/,
    ];

    // Check if any pattern matches
    for (const pattern of questionPatterns) {
      if (pattern.test(output)) {
        console.log(`[ExternalAgent ${this.sessionId}] Question detected with pattern:`, pattern);
        return true;
      }
    }

    return false;
  }

  /**
   * Save HITL state to TaskContext (Internal implementation).
   */
  private async saveHITLStateInternal(taskId: string, hitlState: any): Promise<void> {
    try {
      console.log('[ExternalAgent] saveHITLStateInternal called', { taskId, hitlState });
      const contextManager = new ContextManager();
      const taskContext = await contextManager.getContext(taskId);

      if (taskContext) {
        taskContext.hitlState = hitlState;
        await contextManager.saveContext(taskContext);
        console.log('[ExternalAgent] HITL state saved successfully');
      } else {
        console.warn('[ExternalAgent] TaskContext not found, cannot save HITL state');
      }
    } catch (error) {
      console.error('[ExternalAgent] Failed to save HITL state:', error);
    }
  }

  /**
   * Poll internally waiting for HITL clarification result (Internal implementation).
   */
  private async pollHITLResultInternal(taskId: string): Promise<{ content: string; feedback?: string }> {
    const POLL_INTERVAL = 2000; // 2 seconds
    const TIMEOUT = 600 * 1000; // 10 minutes
    const startTime = Date.now();

    console.log('[ExternalAgent] Starting HITL polling', { taskId, POLL_INTERVAL, TIMEOUT });

    while (Date.now() - startTime < TIMEOUT) {
      try {
        const contextManager = new ContextManager();
        const taskContext = await contextManager.getContext(taskId);

        if (!taskContext?.hitlState) {
          console.warn('[ExternalAgent] HITL state not found during polling', { taskId });
          return { content: '' };
        }

        if (taskContext.hitlState.status === 'completed' && taskContext.hitlState.response) {
          console.log('[ExternalAgent] HITL response received', {
            taskId,
            response: taskContext.hitlState.response.content,
          });
          return {
            content: taskContext.hitlState.response.content,
            feedback: taskContext.hitlState.response.feedback,
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      } catch (error) {
        console.error('[ExternalAgent] Error during HITL polling:', error);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
    }

    // Timeout - return empty result
    console.warn('[ExternalAgent] HITL polling timeout', { taskId });
    return { content: '' };
  }

  /**
   * Clear HITL state (Internal implementation).
   */
  private async clearHITLStateInternal(taskId: string): Promise<void> {
    try {
      const contextManager = new ContextManager();
      const taskContext = await contextManager.getContext(taskId);

      if (taskContext && taskContext.hitlState) {
        taskContext.hitlState = undefined;
        await contextManager.saveContext(taskContext);
        console.log('[ExternalAgent] HITL state cleared');
      }
    } catch (error) {
      console.error('[ExternalAgent] Failed to clear HITL state:', error);
    }
  }

  /**
   * Cleanup resources.
   *
   * @override
   */
  async cleanup(): Promise<void> {
    console.log(`[ExternalAgent ${this.sessionId}] Cleaning up`);

    // Close runtime session if exists
    if (this.acpRuntime && this.runtimeHandle) {
      try {
        await this.acpRuntime.close({
          handle: this.runtimeHandle,
          reason: 'ExternalAgent cleanup',
        });
        console.log(`[ExternalAgent ${this.sessionId}] Runtime session closed`);
      } catch (error) {
        console.error(`[ExternalAgent ${this.sessionId}] Failed to close session:`, error);
      }
    }

    // Call base cleanup
    await super.cleanup();

    // Reset state
    this.acpRuntime = null;
    this.runtimeHandle = null;
  }

  /**
   * Get agent info.
   *
   * @override
   */
  getInfo(): Record<string, any> {
    return {
      type: 'ExternalAgent',
      sessionId: this.sessionId,
      externalAgent: this.externalConfig?.type,
      protocol: this.externalConfig?.protocol || 'acp',
      runtimeHandleId: this.runtimeHandle?.sessionKey,
    };
  }

  /**
   * Get subject info for trace display.
   *
   * @override
   */
  getSubjectInfo(): { subjectTitle: string; subjectSubTitle?: string } {
    return {
      subjectTitle: 'External Agent',
      subjectSubTitle: this.externalConfig?.type || 'Unknown',
    };
  }
}
