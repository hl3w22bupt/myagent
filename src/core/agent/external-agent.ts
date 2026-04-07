/**
 * ExternalAgent - Agent that delegates to external coding agents via ACP protocol.
 *
 * This agent uses acpx runtime to communicate with external agents.
 */

import { Agent } from './agent';
import { AgentConfig, AgentResult, ExternalAgentConfig } from './types';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

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
   * 4. Create temporary directory (auto-generated)
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

    // 3. Create temporary workspace
    const tempDir = join('/tmp/myagent-workspaces', `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);

    // Ensure directory exists
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    console.log(`[ExternalAgent ${this.sessionId}] Created temporary workspace: ${tempDir}`);
    return tempDir;
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
            workspace: this.currentWorkspace, // ← 包含实际使用的 workspace
            fileOperations: fileOperations, // ← 添加文件操作信息
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
