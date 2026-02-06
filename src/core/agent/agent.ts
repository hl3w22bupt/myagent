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

  // Dynamic skill discovery
  private skillDiscovery: SkillDiscovery;
  private static skillsRegistry: Array<{ name: string; description: string; tags: string[] }> = [];

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

    // CRITICAL FIX: Wait for skills to be initialized before task execution
    // This prevents "Skill not found" errors due to race conditions
    await Agent.initializeSkillsRegistry();

    // Filter skills based on config.availableSkills
    const filteredSkills = this.config.availableSkills
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

        for (let attempt = 1; attempt <= maxPtcRetries; attempt++) {
          try {
            console.log(`[Agent] PTC generation attempt ${attempt}/${maxPtcRetries}`);

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

            const result = await this.ptcGenerator.generateWithResult(task, ptcOptions);

            console.log('[Agent] PTC code generated', {
              codeLength: result.code.length,
              selectedSkills: result.selectedSkills,
              attempt
            });

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
            console.error(`[Agent] PTC generation failed on attempt ${attempt}:`, error.message);

            // Check if should retry
            const isRetryable = isDefaultRetryableError(error);

            if (!isRetryable || attempt >= maxPtcRetries) {
              console.error('[Agent] PTC generation failed, will not retry', {
                isRetryable,
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
            llmCalls: 1,
            skillCalls: 0,
            totalTokens: 0,
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

      // Count skill calls from PTC code
      const skillCalls = this.countSkillCalls(ptcResult.code);

      // Extract artifact_type from skill output
      // Skills may return Python dict with 'metadata': {'artifact_type': 'video'}
      const artifactType = this.extractArtifactType(sandboxResult);

      return {
        success: true,
        output: sandboxResult.output,
        steps,
        executionTime,
        sessionId: this.sessionId,
        state: {
          conversationLength: this.state.conversationHistory.length,
          executionCount: this.state.executionHistory.length,
          variablesCount: this.state.variables.size,
        },
        metadata: {
          llmCalls: 1,
          skillCalls,
          totalTokens: 0,
          skillNames: ptcResult.selectedSkills,
          artifactType: artifactType, // Add artifact_type to metadata
          structuredOutput: sandboxResult.structuredOutput, // Add structured output
          retries: retryInfo.attempts > 1 ? retryInfo : undefined,
          ptcRetries: ptcRetryInfo.attempts > 1 ? ptcRetryInfo : undefined,
        },
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
        metadata: {
          llmCalls: 1,
          skillCalls: 0,
          totalTokens: 0,
        },
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
}
