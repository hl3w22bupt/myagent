/**
 * Base Agent class.
 *
 * Provides core Agent functionality:
 * - PTC code generation
 * - Sandbox execution
 * - Result processing
 */

import { LLMClient } from './llm-client';
import { SandboxFactory } from '../sandbox/factory';
import { PTCGenerator } from './ptc-generator';
import { AgentConfig, AgentResult, AgentStep, SessionState } from './types';
import { SkillDiscovery, getSkillDiscovery } from './skill-discovery';
import { retryOperation, isDefaultRetryableError } from './retry';
import { getAgentStreams } from './hooks/progress-notify';
import { ContextManager } from '../context/manager';
import { HITLState } from '../database/context-types';

/**
 * Base Agent class with core Agent capabilities.
 */
export class Agent {
  protected config: AgentConfig;
  protected llm: LLMClient;
  protected sandbox: any;
  protected ptcGenerator: PTCGenerator;
  protected sessionId: string;
  private state: SessionState;
  protected agentName: string = ''; // Agent display name (e.g., "Master Agent", "system-guide")

  // Dynamic skill discovery
  private skillDiscovery: SkillDiscovery;
  private static skillsRegistry: Array<{ name: string; description: string; tags: string[] }> = [];

  // Hook manager for agent lifecycle hooks
  protected hookManager: any = null;

  // Track current execution round for PTC code storage
  protected currentRound: number = 1;

  constructor(config: AgentConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;

    // Initialize skill discovery
    this.skillDiscovery = getSkillDiscovery();

    // Determine LLM provider and configuration
    const provider = (config.llm?.provider || process.env.DEFAULT_LLM_PROVIDER || 'anthropic') as
      | 'anthropic'
      | 'openai-compatible';
    const apiKey = config.llm?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    const baseURL = config.llm?.baseURL || process.env.LLM_BASE_URL;
    const model = config.llm?.model || process.env.DEFAULT_LLM_MODEL;

    // Initialize LLM Client
    this.llm = new LLMClient({
      provider,
      apiKey,
      baseURL,
      model,
    });

    // Initialize Sandbox
    // IMPORTANT: Only use config passed in AgentConfig, ignore YAML files
    // This ensures configuration from src/index.ts is always used
    if (!config.sandbox?.local && !config.sandbox?.config) {
      throw new Error(
        'Sandbox config is required in AgentConfig. Please provide sandbox.local or sandbox.config.'
      );
    }

    const adapterConfig = {
      type: config.sandbox.type || 'local',
      // Support both 'local' (preferred) and 'config' (legacy) properties
      local: config.sandbox.local || config.sandbox.config || {},
    };

    this.sandbox = SandboxFactory.create(adapterConfig);

    // Initialize session state
    this.state = {
      sessionId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      conversationHistory: [],
      executionHistory: [],
      variables: new Map(),
    };

    // Initialize agent name from config if provided
    this.agentName = (config as any).name || '';

    // Debug: Log config.availableSkills
    console.log(`[Agent ${sessionId}] Constructor config.availableSkills:`, config.availableSkills);

    // Wait for skills registry to be initialized
    // This ensures we can filter skills synchronously in constructor
    Agent.initializeSkillsRegistry().then(() => {
      // Filter skills based on config.availableSkills
      const filteredSkills = config.availableSkills
        ? Agent.skillsRegistry.filter(s => config.availableSkills!.includes(s.name))
        : Agent.skillsRegistry;

      console.log(`[Agent ${sessionId}] Filtered to ${filteredSkills.length}/${Agent.skillsRegistry.length} skills:`,
        config.availableSkills || ['all']);

      // Initialize PTC Generator with filtered skills
      this.ptcGenerator = new PTCGenerator(this.llm, filteredSkills);
    }).catch((error) => {
      console.error('[Agent] Skills initialization failed:', error);
      // Fallback: use empty skills registry
      this.ptcGenerator = new PTCGenerator(this.llm, []);
    });

    // Initialize PTC Generator with empty registry initially
    // Will be updated when skills are loaded
    this.ptcGenerator = new PTCGenerator(this.llm, []);
  }

  /**
   * Initialize skills registry asynchronously.
   * This runs in the background and updates the registry when complete.
   */
  private initializeSkillsRegistryAsync(): void {
    Agent.initializeSkillsRegistry().then(() => {
      // Filter skills based on config.availableSkills
      const filteredSkills = this.config.availableSkills
        ? Agent.skillsRegistry.filter(s => this.config.availableSkills!.includes(s.name))
        : Agent.skillsRegistry;

      console.log(`[Agent ${this.sessionId}] Async skills loaded: ${filteredSkills.length} filtered from ${Agent.skillsRegistry.length} total`);

      // Update PTCGenerator with the filtered skills
      this.ptcGenerator = new PTCGenerator(this.llm, filteredSkills);
    }).catch((error) => {
      console.error('[Agent] Async skills initialization failed:', error);
    });
  }

  /**
   * Wait for skills to be initialized (for testing or when immediate access is needed).
   */
  static async awaitSkillsInitialized(): Promise<void> {
    await Agent.initializeSkillsRegistry();
  }

  /**
   * Format context for LLM consumption
   * Provides structured summary + recent messages
   */
  private formatContextForLLM(context: any): string {
    const parts: string[] = [];

    // Part 1: Summary (if available)
    if (context.summary) {
      parts.push('## Task Context');
      parts.push(`- Current Task: ${context.summary.currentTask}`);
      parts.push(`- Status: ${context.summary.currentStatus}`);

      if (context.summary.completedSteps?.length > 0) {
        parts.push(`- Completed: ${context.summary.completedSteps.join(', ')}`);
      }

      if (context.summary.filesModified?.length > 0) {
        parts.push(`- Modified Files: ${context.summary.filesModified.map((f: any) => f.path).join(', ')}`);
      }
    }

    // Part 2: Recent messages (last 10)
    const recentMessages = context.messages.slice(-10);
    if (recentMessages.length > 0) {
      parts.push('');
      parts.push('## Recent Conversation');
      parts.push(recentMessages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * Initialize skills registry by discovering skills from filesystem.
   * This is a one-time initialization on first Agent instantiation.
   */
  private static skillsInitialized = false;
  private static skillsInitPromise: Promise<void> | null = null;

  private static async initializeSkillsRegistry(): Promise<void> {
    if (Agent.skillsInitialized) {
      return;
    }

    // Return existing promise if initialization is in progress
    if (Agent.skillsInitPromise) {
      return Agent.skillsInitPromise;
    }

    Agent.skillsInitPromise = (async () => {
      try {
        const discovery = getSkillDiscovery();
        const skills = await discovery.discover();
        Agent.skillsRegistry = discovery.getSkillsRegistry();
        Agent.skillsInitialized = true;

        console.log(`[Agent] Initialized skills registry with ${skills.length} skills`);
        skills.forEach((skill) => {
          console.log(`[Agent]   - ${skill.name}: ${skill.description}`);
        });
      } catch (error: any) {
        console.error('[Agent] Failed to initialize skills registry:', error.message);
        console.warn('[Agent] Continuing with empty skills registry');
        Agent.skillsRegistry = [];
        Agent.skillsInitialized = true;
      } finally {
        Agent.skillsInitPromise = null;
      }
    })();

    return Agent.skillsInitPromise;
  }

  /**
   * Execute a task.
   *
   * Main entry point for Agent execution.
   * Generates PTC code and executes it in Sandbox.
   *
   * @param task - User task description
   * @param taskId - Optional task ID for tracking and naming outputs
   * @param context - Optional task context from database (for persistent context)
   * @returns Execution result
   */
  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    console.log('[Agent] agent.run() called', { sessionId: this.sessionId, task, taskId });

    // ✅ 确保 taskId 总是有值的（保持 traces API 关联）
    const effectiveTaskId = taskId || context?.taskId;

    console.log('[Agent] Using effective taskId:', effectiveTaskId, 'for all notifications');

    // ✅ 设置 LLM trace 配置（确保 Subagent 也能记录 LLM trace）
    this.updateLLMTraceConfig(effectiveTaskId);

    // CRITICAL FIX: Wait for skills to be initialized before task execution
    // This prevents "Skill not found" errors due to race conditions
    await Agent.initializeSkillsRegistry();

    // Filter skills based on config.availableSkills
    // Note: Empty array means no filtering (use all skills)
    const filteredSkills = (this.config.availableSkills && this.config.availableSkills.length > 0)
      ? Agent.skillsRegistry.filter(s => this.config.availableSkills!.includes(s.name))
      : Agent.skillsRegistry;

    // Update PTCGenerator with filtered skills
    // This ensures the PTCGenerator only sees the allowed skills
    this.ptcGenerator = new PTCGenerator(this.llm, filteredSkills);
    console.log(`[Agent ${this.sessionId}] PTCGenerator ready with ${filteredSkills.length}/${Agent.skillsRegistry.length} skills`,
      this.config.availableSkills || ['all']);

    // Update activity time
    this.state.lastActivityAt = Date.now();

    // Record user input
    this.state.conversationHistory.push({
      role: 'user',
      content: task,
      timestamp: Date.now(),
    });

    // If context is provided, use it for LLM calls
    if (context && context.messages && context.messages.length > 0) {
      console.log('[Agent] Using database context', {
        totalMessages: context.messages.length,
        currentTurn: context.currentTurn,
        summary: context.summary
      });

      // Override conversationHistory with database context
      // This provides persistent, compressed context
      this.state.conversationHistory = context.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.metadata?.timestamp || Date.now()
      }));

      console.log('[Agent] Updated conversationHistory with database context', {
        historyLength: this.state.conversationHistory.length
      });
    }

    const startTime = Date.now();
    const steps: AgentStep[] = [];

    console.log('[Agent] About to generate PTC code');

    try {
      // === HITL Checkpoint: Resume from previous checkpoint if exists ===
      const hitlState = await this.checkHITLCheckpoint(effectiveTaskId || '', context);
      if (hitlState && hitlState.status === 'completed' && hitlState.response) {
        console.log('[Agent] HITL checkpoint resumed, using clarified task:', hitlState.response.content);
        task = hitlState.response.content;

        // Update conversation history with user's clarification
        this.state.conversationHistory.push({
          role: 'user',
          content: task,
          timestamp: Date.now(),
        });
      }

      // ⭐ Step 0: Analyze intent and send notification
      const intent = await this.notifyIntentAnalysis(task, effectiveTaskId);

      // === HITL Checkpoint: Check if clarification is needed ===
      const clarification = await this.checkIntentClarification(intent, task, effectiveTaskId || '', context);
      if (clarification.needs) {
        console.log('[Agent] Intent clarification needed, entering HITL checkpoint');

        // Send clarification request via Stream
        const streams = getAgentStreams();
        if (streams?.taskExecution) {
          const event = {
            type: 'awaiting_clarification', // Use distinct type like intent_analysis
            progressType: 'clarification',
            status: 'awaiting_clarification',
            taskId: effectiveTaskId || `task-${Date.now()}`,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            data: {
              detectedIntent: intent.intent,
              reasoning: intent.reasoning,
              category: intent.category,
              confidence: intent.confidence,
              question: clarification.question,
              options: clarification.options,
              stage: 'post_intent'
            }
          };

          const groupId = event.taskId;
          const timestamp = Date.now();
          const entryId = `agent-awaiting_clarification-${groupId}-${timestamp}`;

          await streams.taskExecution.set(groupId, entryId, {
            ...event,
            category: 'agent_hook',
          });

          console.log('[Agent] HITL checkpoint notification sent');
        }

        // Save HITL state to database
        await this.saveHITLState(effectiveTaskId || `task-${Date.now()}`, {
          stage: 'post_intent',
          status: 'awaiting',
          question: clarification.question || '',
          options: clarification.options,
          createdAt: new Date()
        });

        // Return AWAITING_CLARIFICATION status
        return {
          success: false,
          error: 'AWAITING_CLARIFICATION',
          clarification: {
            needs: true,
            question: clarification.question,
            options: clarification.options,
            stage: 'post_intent'
          },
          steps: [{
            type: 'hitl_checkpoint',
            content: '任务需要澄清，等待用户补充信息',
            timestamp: Date.now(),
            metadata: { clarification, intent }
          }],
          executionTime: 0,
          sessionId: this.sessionId,
          metadata: {
            hitl: true
          }
        };
      }

      // === HITL Checkpoint passed, continue normal flow ===

      // Step 1: Generate PTC code with retry logic
      steps.push({
        type: 'planning',
        content: 'Generating PTC code for task',
        timestamp: Date.now(),
        metadata: { task },
      });

      // Track PTC generation retry information
      const ptcRetryInfo = {
        attempts: 1,
        totalDelay: 0,
        recovered: false,
      };

      // Generate PTC code with retry (max 3 attempts)
      console.log('[Agent] Calling ptcGenerator.generateWithResult() with retry');

      const ptcResult = await (async () => {
        const maxPtcRetries = 3; // Hardcoded to 3 attempts for PTC generation

        let lastError: Error | null = null;
        let lastErrorMessage: string | null = null; // 保存错误消息用于重试

        for (let attempt = 1; attempt <= maxPtcRetries; attempt++) {
          try {
            console.log(`[Agent] PTC generation attempt ${attempt}/${maxPtcRetries}`, {
              hasPreviousError: !!lastErrorMessage
            });

            // Build options for PTC generator
            const ptcOptions: any = {
              history: this.state.conversationHistory,
              variables: Object.fromEntries(this.state.variables),
            };

            // If context contains originalTask (from MasterAgent), pass it directly
            // This ensures PTC code generator respects the original user request
            if (context && context.originalTask) {
              ptcOptions.originalTask = context.originalTask;
            }

            // Pass previous error if this is a retry attempt
            const result = await this.ptcGenerator.generateWithResult(
              task,
              ptcOptions,
              lastErrorMessage || undefined // 传递上一次的错误信息
            );

            console.log('[Agent] PTC code generated', {
              codeLength: result.code.length,
              selectedSkills: result.selectedSkills,
              attempt
            });

            // ⭐ Send PTC planning notification
            await this.notifyPTCPlanning(task, result, effectiveTaskId);

            // Success
            if (attempt > 1) {
              ptcRetryInfo.attempts = attempt;
              ptcRetryInfo.recovered = true;
              steps.push({
                type: 'ptc-generation',
                content: `PTC code generation succeeded on attempt ${attempt}`,
                timestamp: Date.now(),
              });
            }

            return result;

          } catch (error: any) {
            lastError = error;
            // 保存错误消息，用于下一次重试
            lastErrorMessage = error.message || String(error);
            console.error(`[Agent] PTC generation failed on attempt ${attempt}:`, lastErrorMessage);

            // PTC generation always retries (LLM has randomness, max 3 attempts)
            if (attempt >= maxPtcRetries) {
              console.error('[Agent] PTC generation failed, will not retry', {
                attempt,
                maxAttempts: maxPtcRetries
              });
              throw error;
            }

            // Retry with exponential backoff
            const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
            console.log(`[Agent] Retrying PTC generation in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            ptcRetryInfo.totalDelay += delay;
            steps.push({
              type: 'planning',
              content: `PTC generation retry attempt ${attempt + 1} after ${delay}ms: ${error.message}`,
              timestamp: Date.now(),
            });
          }
        }

        // Should never reach here, but TypeScript needs it
        throw lastError || new Error('PTC generation failed');
      })();

      steps.push({
        type: 'ptc-generation',
        content: ptcResult.code,
        timestamp: Date.now(),
        metadata: {
          codeLength: ptcResult.code.length,
          language: 'python',
          selectedSkills: ptcResult.selectedSkills,
          reasoning: ptcResult.reasoning,
        },
      });

      // Save PTC code to database for debugging
      console.log('[Agent] About to save PTC code', { taskId, currentRound: this.currentRound, hasCode: !!ptcResult?.code });
      if (taskId) {
        this.savePtcCode(taskId, ptcResult, this.currentRound).catch(err => {
          console.error('[Agent] Failed to save PTC code:', err);
        });
      } else {
        console.warn('[Agent] No taskId provided, skipping PTC code save');
      }

      // Step 2: Execute in Sandbox with retry logic
      steps.push({
        type: 'execution',
        content: 'Executing PTC code in sandbox',
        timestamp: Date.now(),
      });

      console.log('[Agent] Executing PTC code in sandbox');

      // Get retry configuration
      const retryConfig = this.config.constraints?.retry;

      // Track retry information
      const retryInfo = {
        attempts: 1,
        totalDelay: 0,
        recovered: false,
      };

      const sandboxResult = await (async () => {
        // If retry is disabled, execute directly
        if (!retryConfig || (retryConfig.maxRetries !== undefined && retryConfig.maxRetries <= 0)) {
          return await this.sandbox.execute(ptcResult.code, {
            skills: ptcResult.selectedSkills || [],
            skillImplPath: process.cwd(),
            sessionId: this.sessionId,
            timeout: this.config.constraints?.timeout || 600000, // 10 minutes default for video generation
            metadata: {
              traceId: this.sessionId,
              task,
              taskId,
              maxIterations: this.config.constraints?.maxIterations || 5, // Agent loop support
            },
          });
        }

        // Execute with retry
        const retryResult = await retryOperation(
          async () => {
            const result = await this.sandbox.execute(ptcResult.code, {
              skills: ptcResult.selectedSkills || [],
              skillImplPath: process.cwd(),
              sessionId: this.sessionId,
              timeout: this.config.constraints?.timeout || 600000, // 10 minutes default for video generation
              metadata: {
                traceId: this.sessionId,
                task,
                taskId,
                retryAttempt: retryInfo.attempts,
                maxIterations: this.config.constraints?.maxIterations || 5, // Agent loop support
              },
            });

            // If execution failed, throw error for retry logic
            if (!result.success) {
              const error = new Error(result.error?.message || 'Sandbox execution failed');
              (error as any).sandboxResult = result;
              throw error;
            }

            return result;
          },
          {
            ...retryConfig,
            // Custom retry logic for LLM-generated code:
            // Retry SyntaxErrors because LLM has randomness - second attempt may succeed
            isRetryable: retryConfig.isRetryable || ((error: Error) => {
              const message = error.message.toLowerCase();

              // Always retry sandbox execution errors for LLM-generated code
              // LLM has randomness, so syntax errors may be temporary
              if (message.includes('sandbox') || message.includes('execution')) {
                return true;
              }

              // Retry syntax errors in generated code (LLM randomness)
              if (message.includes('syntax error')) {
                return true;
              }

              // Use default retry logic for other errors
              return isDefaultRetryableError(error);
            }),
            onRetry: (attempt, error, delay) => {
              console.log('[Agent] Retrying sandbox execution', {
                attempt,
                error: error.message,
                delay,
                maxRetries: retryConfig?.maxRetries || 3,
              });
              steps.push({
                type: 'execution',
                content: `Retry attempt ${attempt} after ${Math.round(delay)}ms delay: ${error.message}`,
                timestamp: Date.now(),
              });
            },
          }
        );

        // Update retry information
        retryInfo.attempts = retryResult.attempts;
        retryInfo.totalDelay = retryResult.totalDelay;
        retryInfo.recovered = retryResult.attempts > 1 && retryResult.success;

        // Check if retry was successful
        if (!retryResult.success || !retryResult.data) {
          throw retryResult.error || new Error('Retry failed');
        }

        // Log retry information
        if (retryResult.attempts > 1) {
          console.log('[Agent] Sandbox execution recovered after retries', {
            attempts: retryResult.attempts,
            totalDelay: retryResult.totalDelay,
          });
        }

        return retryResult.data;
      })();

      console.log('[Agent] Sandbox execution completed', { success: sandboxResult.success });

      // Step 3: Process result
      const executionTime = Date.now() - startTime;

      if (!sandboxResult.success) {
        // Record error in conversation history
        this.state.conversationHistory.push({
          role: 'assistant',
          content: `Error: ${sandboxResult.error?.message || 'Execution failed'}`,
          timestamp: Date.now(),
        });

        return {
          success: false,
          error: sandboxResult.error?.message || 'Execution failed',
          steps,
          executionTime,
          sessionId: this.sessionId,
          state: {
            conversationLength: this.state.conversationHistory.length,
            executionCount: this.state.executionHistory.length,
            variablesCount: this.state.variables.size,
          },
          metadata: {
            retries: retryInfo.attempts > 1 ? retryInfo : undefined,
            ptcRetries: ptcRetryInfo.attempts > 1 ? ptcRetryInfo : undefined,
          },
        };
      }

      // Record execution history
      this.state.executionHistory.push({
        task,
        result: sandboxResult.output,
        timestamp: Date.now(),
        executionTime,
      });

      // Record assistant response
      this.state.conversationHistory.push({
        role: 'assistant',
        content: sandboxResult.output,
        timestamp: Date.now(),
      });

      // Save variables if returned from sandbox
      if (sandboxResult.variables) {
        Object.entries(sandboxResult.variables).forEach(([key, value]) => {
          this.state.variables.set(key, value);
        });
      }

      // Extract artifact_type from skill output
      // Skills may return Python dict with 'metadata': {'artifact_type': 'video'}
      const artifactType = this.extractArtifactType(sandboxResult);

      // CRITICAL: Check structuredOutput for actual success status
      // Skills may return business logic failures via unified format (success: false)
      // even though the process exited cleanly (exitCode=0).
      // We need to respect the skill's determination of success/failure.
      let actualSuccess = true;
      let errorMessage: string | undefined = undefined;

      if (sandboxResult.structuredOutput) {
        const so = sandboxResult.structuredOutput as any;
        if (typeof so.success === 'boolean' && !so.success) {
          actualSuccess = false;
          // Extract error message from structured output if available
          if (so.content && typeof so.content === 'object') {
            errorMessage = so.content.message || so.content.error || so.content.reason || 'Skill execution failed';
          } else if (so.message) {
            errorMessage = so.message;
          } else if (so.error) {
            errorMessage = so.error;
          }

          console.log('[Agent] Structured output indicates failure:', {
            resultType: so.result_type,
            errorMessage,
            structuredOutput: JSON.stringify(so).substring(0, 500),
          });
        }
      }

      return {
        success: actualSuccess,
        output: sandboxResult.output,
        error: errorMessage,
        steps,
        executionTime,
        sessionId: this.sessionId,
        state: {
          conversationLength: this.state.conversationHistory.length,
          executionCount: this.state.executionHistory.length,
          variablesCount: this.state.variables.size,
        },
        metadata: {
          skillNames: ptcResult.selectedSkills,
          artifactType: artifactType, // Add artifact_type to metadata
          retries: retryInfo.attempts > 1 ? retryInfo : undefined,
          ptcRetries: ptcRetryInfo.attempts > 1 ? ptcRetryInfo : undefined,
        },
        structuredOutput: sandboxResult.structuredOutput, // Structured output at root level
      };

    } catch (error: any) {
      // Record error in conversation history
      this.state.conversationHistory.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      });

      steps.push({
        type: 'error',
        content: error.message,
        timestamp: Date.now(),
        metadata: {
          stack: error.stack,
        },
      });

      return {
        success: false,
        error: error.message,
        steps,
        executionTime: Date.now() - startTime,
        sessionId: this.sessionId,
        state: {
          conversationLength: this.state.conversationHistory.length,
          executionCount: this.state.executionHistory.length,
          variablesCount: this.state.variables.size,
        },
        metadata: {},
      };
    }
  }

  /**
   * Count the number of skill calls in PTC code.
   */
  private countSkillCalls(code: string): number {
    const matches = code.match(/executor\.execute/g);
    return matches ? matches.length : 0;
  }

  /**
   * Extract artifact_type from structured output
   * 优先级：structuredOutput.result_type（唯一来源）
   */
  private extractArtifactType(sandboxResult: any): string | undefined {
    // 调试：输出完整的 sandboxResult.structuredOutput
    console.log('[Agent] extractArtifactType called, sandboxResult.structuredOutput:',
      JSON.stringify(sandboxResult.structuredOutput, null, 2));

    // 直接从 structuredOutput 获取
    if (sandboxResult.structuredOutput?.result_type) {
      const resultType = sandboxResult.structuredOutput.result_type;
      console.log(`[Agent] Found artifact_type from structuredOutput: ${resultType}`);

      // 映射 result_type 到 artifact_type（如果需要）
      const typeMapping: Record<string, string> = {
        'infographic': 'image',
        'video': 'video',
        'image': 'image',
        'audio': 'audio',
        'table': 'table',
        'code': 'code',
      };

      return typeMapping[resultType] || resultType;
    }

    // 如果没有 structuredOutput，返回 undefined
    console.warn('[Agent] No structuredOutput found');
    return undefined;
  }

  /**
   * Get session state.
   */
  getState(): Readonly<SessionState> {
    return this.state;
  }

  /**
   * Set a variable.
   */
  setVariable(key: string, value: any): void {
    this.state.variables.set(key, value);
  }

  /**
   * Get a variable.
   */
  getVariable(key: string): any {
    return this.state.variables.get(key);
  }

  /**
   * Cleanup resources.
   */
  async cleanup(): Promise<void> {
    await this.sandbox.cleanup(this.sessionId);
    // Clear session state
    this.state.conversationHistory = [];
    this.state.executionHistory = [];
    this.state.variables.clear();
  }

  /**
   * Get Agent info.
   */
  getInfo(): Record<string, any> {
    return {
      type: 'Agent',
      sessionId: this.sessionId,
      availableSkills: this.config.availableSkills,
      llmModel: this.config.llm?.model,
      sandboxType: this.config.sandbox?.type,
      discoveredSkills: Agent.skillsRegistry.length,
    };
  }

  /**
   * Get subject info for trace display.
   * Returns subjectTitle and subjectSubTitle for UI rendering.
   */
  getSubjectInfo(): { subjectTitle: string; subjectSubTitle?: string } {
    // Default: Subagent (will be overridden by MasterAgent)
    const subjectTitle = 'Subagent';
    const subjectSubTitle = this.agentName || undefined;
    return { subjectTitle, subjectSubTitle };
  }

  /**
   * Set hook manager for this agent instance.
   * Allows agent to trigger its own lifecycle hooks.
   */
  setHookManager(hookManager: any): void {
    this.hookManager = hookManager;
  }

  /**
   * Get all discovered skills (static method).
   */
  static getDiscoveredSkills(): Array<{ name: string; description: string; tags: string[] }> {
    return Agent.skillsRegistry;
  }

  /**
   * Reload skills registry (useful for development/hot-reload).
   */
  static async reloadSkills(): Promise<void> {
    const discovery = getSkillDiscovery();
    const skills = await discovery.reload();
    Agent.skillsRegistry = discovery.getSkillsRegistry();
    Agent.skillsInitialized = true;

    console.log(`[Agent] Reloaded skills registry with ${skills.length} skills`);
  }

  /**
   * Update LLMClient trace configuration.
   * Call this after setting agent streams via setAgentStreams().
   */
  updateLLMTraceConfig(taskId?: string): void {
    const streams = getAgentStreams();
    if (streams?.executionTraces && taskId) {
      // Update LLMClient with streams and trace context
      (this.llm as any).streams = streams;
      (this.llm as any).traceContext = {
        taskId,
        agentId: this.sessionId,
      };
      console.log('[Agent] LLM trace config updated', { taskId, agentId: this.sessionId });
    }
  }

  /**
   * Get skill discovery stats.
   */
  static getSkillStats(): {
    total: number;
    byTag: Record<string, number>;
    byType: Record<string, number>;
  } {
    const discovery = getSkillDiscovery();
    return discovery.getStats();
  }

  /**
   * Analyze task intent and send notification.
   */
  private async notifyIntentAnalysis(task: string, taskId?: string): Promise<{
    intent: string;
    reasoning: string;
    category: string;
    confidence?: number;
    possibleIntents?: string[];
  }> {
    const streams = getAgentStreams();

    if (!streams?.taskExecution) {
      console.warn('[Agent] No taskExecution stream available, skipping intent notification');
      return this.fallbackIntentDetection(task);
    }

    try {
      const analysisResult = await this.analyzeIntentWithLLM(task);

      const event = {
        type: 'intent_analysis',
        progressType: 'reasoning',
        status: 'analyzing',  // 进行中状态
        taskId: taskId || `task-${Date.now()}`,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          originalTask: task,
          intent: analysisResult.intent,
          reasoning: analysisResult.reasoning,
          category: analysisResult.category,
          agentType: this.constructor.name
        }
      };

      const groupId = event.taskId;
      const timestamp = Date.now();
      const entryId = `agent-${event.type}-${groupId}-${timestamp}`;

      await streams.taskExecution.set(groupId, entryId, {
        ...event,
        category: 'agent_hook',
      });

      // ⭐ Send to executionTraces stream
      if (streams.executionTraces) {
        const id = `intent-analysis-${groupId}-${timestamp}`;
        await streams.executionTraces.set(groupId, id, {
          id,
          level: 'agent-internal',
          taskId: groupId,
          agentId: this.sessionId,
          stage: 'intent_analysis',
          status: 'completed',
          inputData: JSON.stringify({ task, agentType: this.constructor.name }),
          outputData: JSON.stringify({
            intent: analysisResult.intent,
            reasoning: analysisResult.reasoning,
            category: analysisResult.category,
            confidence: analysisResult.confidence,
            possibleIntents: analysisResult.possibleIntents,
          }),
          timestamp: new Date(timestamp).toISOString(),
          metadata: {
            sessionId: this.sessionId,
            data: {
              llmProvider: this.llm.getInfo().provider,
              llmModel: this.llm.getInfo().model,
            },
          },
        });
        console.log('[Agent] ✅ Intent analysis trace sent');
      }

      console.log('[Agent] ✅ Intent analysis notification sent');
      return analysisResult;
    } catch (error) {
      console.error('[Agent] Failed to send intent analysis notification:', error);
      return this.fallbackIntentDetection(task);
    }
  }

  /**
   * Send PTC planning event notification.
   */
  private async notifyPTCPlanning(task: string, ptcResult: any, taskId?: string): Promise<void> {
    const streams = getAgentStreams();

    if (!streams?.taskExecution) {
      console.warn('[Agent] No taskExecution stream available, skipping PTC planning notification');
      return;
    }

    try {
      const skills = ptcResult.selectedSkills || [];

      const event = {
        type: 'ptc_planning',
        progressType: 'skill-selection',
        status: 'planning',  // 进行中状态
        taskId: taskId || `task-${Date.now()}`,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          userTask: task,
          selectedSkills: skills,
          reasoning: ptcResult.reasoning,
          executionPlan: this.formatExecutionPlan(skills)
        }
      };

      const groupId = event.taskId;
      const timestamp = Date.now();
      const entryId = `agent-${event.type}-${groupId}-${timestamp}`;

      await streams.taskExecution.set(groupId, entryId, {
        ...event,
        category: 'agent_hook',
      });

      // ⭐ Send to executionTraces stream
      if (streams.executionTraces) {
        const id = `ptc-planning-${groupId}-${timestamp}`;
        await streams.executionTraces.set(groupId, id, {
          id,
          level: 'agent-internal',
          taskId: groupId,
          agentId: this.sessionId,
          stage: 'ptc_planning',
          status: 'completed',
          inputData: JSON.stringify({ task, agentType: this.constructor.name }),
          outputData: JSON.stringify({
            selectedSkills: skills,
            reasoning: ptcResult.reasoning,
            executionPlan: this.formatExecutionPlan(skills),
            codeLength: ptcResult.code?.length || 0,
          }),
          timestamp: new Date(timestamp).toISOString(),
          metadata: {
            sessionId: this.sessionId,
            data: {
              llmProvider: this.llm.getInfo().provider,
              llmModel: this.llm.getInfo().model,
            },
          },
        });
        console.log('[Agent] ✅ PTC planning trace sent');
      }

      console.log('[Agent] ✅ PTC planning notification sent');
    } catch (error) {
      console.error('[Agent] Failed to send PTC planning notification:', error);
    }
  }

  /**
   * Analyze task intent using LLM.
   */
  private async analyzeIntentWithLLM(task: string): Promise<{
    intent: string;
    reasoning: string;
    category: string;
    confidence: number;
    possibleIntents?: string[];
  }> {
    try {
      const prompt = `Analyze the following task and identify the user's intent:

Task: "${task}"

Please respond in the following JSON format:
{
  "intent": "video_generation|code_generation|review|design|frontend_design|text_generation|general",
  "category": "creative|analytical|technical",
  "reasoning": "Brief explanation of why this intent was chosen",
  "confidence": 0.0-1.0,
  "possibleIntents": ["alternative_intent_1", "alternative_intent_2"]  // Only include if confidence < 0.7
}

Intent types:
- video_generation: Creating videos, animations, visual content
- code_generation: Writing code, programming, software development
- review: Reviewing code, analyzing content, quality assessment
- design: Creating designs, visual content, layouts
- frontend_design: Web development, UI/UX, frontend code
- text_generation: Writing documentation, content creation
- general: General tasks that don't fit other categories

Categories:
- creative: Creating new content (video, design, code)
- analytical: Analyzing existing content (review, audit)
- technical: Technical implementation (code, infrastructure)

Confidence:
- 0.9-1.0: Very clear intent with specific details
- 0.7-0.9: Clear intent but minor ambiguity
- 0.5-0.7: Somewhat unclear, multiple possible interpretations
- 0.3-0.5: Vague, needs clarification
- 0.0-0.3: Very vague, highly ambiguous

Respond ONLY with valid JSON, no other text.`;

      // Build system prompt for intent analysis
      const intentSystemPrompt = `You are an intent analyzer. Your task is to determine the user's intent from their request.
Analyze the task description and categorize it appropriately. Provide confidence scores to indicate certainty.`;

      const response = await this.llm.messagesCreate(
        [
          { role: 'system', content: intentSystemPrompt },
          { role: 'user', content: prompt }
        ],
        { max_tokens: 500, temperature: 0.3 },
        'intent analysis'
      );

      const content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log('[Agent] Intent analysis completed:', result);
        return {
          intent: result.intent || 'general',
          reasoning: result.reasoning || 'General task',
          category: result.category || 'general',
          confidence: result.confidence || 0.8,
          possibleIntents: result.possibleIntents
        };
      } else {
        throw new Error('Invalid JSON response from LLM');
      }
    } catch (error) {
      console.error('[Agent] LLM intent analysis failed, falling back to simple detection:', error);
      return this.fallbackIntentDetection(task);
    }
  }

  /**
   * Fallback intent detection - returns generic intent with low confidence.
   * The low confidence will trigger LLM-based clarification in checkIntentClarification.
   */
  private fallbackIntentDetection(_task: string): {
    intent: string;
    reasoning: string;
    category: string;
    confidence: number;
    possibleIntents?: string[];
  } {
    // Return generic intent with very low confidence
    // This will trigger clarification in checkIntentClarification which uses LLM
    return {
      intent: 'general',
      reasoning: 'LLM intent analysis unavailable, using generic fallback',
      category: 'general',
      confidence: 0.1,  // Very low confidence to trigger clarification
      possibleIntents: ['code_generation', 'text_generation', 'design', 'video_generation']
    };
  }

  /**
   * Format execution plan for display.
   */
  private formatExecutionPlan(skills: string[]): string {
    if (skills.length === 0) return '直接执行';
    if (skills.length === 1) return `使用 ${skills[0]} skill`;
    return `使用 ${skills.join(' + ')} skills`;
  }

  /**
   * Check if intent clarification is needed using LLM.
   * Returns a more intelligent clarification request based on task analysis.
   */
  private async checkIntentClarification(
    intent: any,
    task: string,
    _taskId: string,
    context: any
  ): Promise<{ needs: boolean; question?: string; options?: string[] }> {
    // Skip HITL in test environment or if explicitly disabled
    if (process.env.NODE_ENV === 'test' || context?.skipHITL) {
      return { needs: false };
    }

    // 如果置信度高，不需要澄清
    if (intent.confidence >= 0.7) {
      return { needs: false };
    }

    // 使用 LLM 判断是否需要澄清并生成澄清问题
    try {
      const prompt = `分析以下任务，判断是否需要向用户澄清才能更好地完成任务。

任务: "${task}"

当前意图分析:
- 检测到的意图: ${intent.intent}
- 置信度: ${intent.confidence}
- 推理: ${intent.reasoning}
- 类别: ${intent.category}
- 可能的其他意图: ${intent.possibleIntents?.join(', ') || '无'}

请以 JSON 格式回复，包含以下字段:
{
  "needs_clarification": true/false,  // 是否需要澄清
  "question": "澄清问题",  // 如果需要澄清，向用户提出的问题
  "options": ["选项1", "选项2", ...]  // 可选的回答选项（如果有）
}

澄清规则:
1. 如果置信度 < 0.5，需要澄清
2. 如果任务描述过于模糊（少于5个有意义的词），需要澄清
3. 如果缺少关键信息（如 creative 类别缺少主题/风格，technical 类别缺少具体需求），需要澄清
4. 澄清问题要具体、有帮助，引导用户提供更多信息
5. 选项要简洁明了，通常 2-4 个选项

如果不需要澄清，返回: {"needs_clarification": false}`;

      const response = await this.llm.messagesCreate([
        { role: 'user', content: prompt }
      ], {
        max_tokens: 500,
        temperature: 0.3
      }, 'clarification check');

      const responseText = response.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
      const clarification = JSON.parse(jsonStr);

      if (clarification.needs_clarification) {
        return {
          needs: true,
          question: clarification.question || `请提供更多关于"${task}"的信息`,
          options: clarification.options || []
        };
      }

      return { needs: false };
    } catch (error) {
      // 如果 LLM 调用失败，fallback 到简单规则
      console.error('[Agent] LLM clarification check failed, using fallback rules:', error);
      if (intent.confidence < 0.5) {
        return {
          needs: true,
          question: `您的任务"${task}"不够详细，请问您想做什么？`,
          options: intent.possibleIntents || ['创建视频', '编写代码', '生成文档', '数据分析']
        };
      }
      return { needs: false };
    }
  }

  /**
   * Check if there's a pending HITL checkpoint to resume from.
   */
  private async checkHITLCheckpoint(taskId: string, context: any): Promise<HITLState | null> {
    if (!taskId || !context) return null;

    try {
      const contextManager = new ContextManager();
      const taskContext = await contextManager.getContext(taskId);
      return taskContext?.hitlState || null;
    } catch (error) {
      console.error('[Agent] Failed to check HITL checkpoint:', error);
      return null;
    }
  }

  /**
   * Save HITL state to TaskContext.
   */
  private async saveHITLState(taskId: string, hitlState: HITLState): Promise<void> {
    try {
      const contextManager = new ContextManager();
      const taskContext = await contextManager.getContext(taskId);

      if (taskContext) {
        taskContext.hitlState = hitlState;
        await contextManager.saveContext(taskContext);
        console.log('[Agent] HITL state saved:', hitlState);
      } else {
        console.warn('[Agent] TaskContext not found, cannot save HITL state');
      }
    } catch (error) {
      console.error('[Agent] Failed to save HITL state:', error);
    }
  }

  /**
   * Save PTC code to database for debugging and frontend display
   */
  private async savePtcCode(
    taskId: string,
    ptcResult: { code: string; selectedSkills: string[]; reasoning?: string },
    providedRound: number
  ): Promise<void> {
    try {
      // Get data store
      const { getDataStore } = await import('../database/data-store.js');
      const dataStore = getDataStore();

      // Get existing task
      const task = await dataStore.getTask(taskId);
      if (!task) {
        console.warn('[Agent] Task not found, cannot save PTC code:', taskId);
        return;
      }

      // Calculate round based on existing PTC codes (same logic as output-history-tracker)
      const existingCodes = task.ptcCodes || [];
      const round = existingCodes.length + 1;

      console.log('[Agent] Calculated PTC round', {
        taskId,
        providedRound,
        calculatedRound: round,
        existingCodesCount: existingCodes.length
      });

      // Create PTC code record (inline type, no import needed)
      const ptcCodeRecord = {
        round,
        code: ptcResult.code,
        selectedSkills: ptcResult.selectedSkills || [],
        reasoning: ptcResult.reasoning,
        timestamp: Date.now(),
      };

      // Get existing codes and update
      // Filter out old code for same round (if retrying) and add new one
      const filteredCodes = existingCodes.filter((c: any) => c.round !== round);
      filteredCodes.push(ptcCodeRecord);

      // Update task
      await dataStore.updateTask(taskId, { ptcCodes: filteredCodes });
      console.log('[Agent] PTC code saved for task:', taskId, 'round:', round);
    } catch (error) {
      console.error('[Agent] Failed to save PTC code:', error);
    }
  }

}
