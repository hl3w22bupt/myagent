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

    // Initialize PTC Generator with dynamic skills registry
    // Note: Skills will be loaded asynchronously, but we pass the current registry
    // The PTCGenerator will have access to skills as they're discovered
    this.ptcGenerator = new PTCGenerator(this.llm, Agent.skillsRegistry);

    // Initialize skills registry asynchronously (non-blocking)
    this.initializeSkillsRegistryAsync();
  }

  /**
   * Initialize skills registry asynchronously.
   * This runs in the background and updates the registry when complete.
   */
  private initializeSkillsRegistryAsync(): void {
    Agent.initializeSkillsRegistry().then(() => {
      // Update PTCGenerator with the loaded skills
      this.ptcGenerator = new PTCGenerator(this.llm, Agent.skillsRegistry);
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
   * @returns Execution result
   */
  async run(task: string): Promise<AgentResult> {
    // Update activity time
    this.state.lastActivityAt = Date.now();

    // Record user input
    this.state.conversationHistory.push({
      role: 'user',
      content: task,
      timestamp: Date.now(),
    });

    const startTime = Date.now();
    const steps: AgentStep[] = [];

    try {
      // Step 1: Generate PTC code
      steps.push({
        type: 'planning',
        content: 'Generating PTC code for task',
        timestamp: Date.now(),
        metadata: { task },
      });

      // Generate PTC code with conversation history and variables as context
      const ptcCode = await this.ptcGenerator.generate(task, {
        history: this.state.conversationHistory,
        variables: Object.fromEntries(this.state.variables),
      });

      steps.push({
        type: 'ptc-generation',
        content: ptcCode,
        timestamp: Date.now(),
        metadata: {
          codeLength: ptcCode.length,
          language: 'python',
        },
      });

      // Step 2: Execute in Sandbox
      steps.push({
        type: 'execution',
        content: 'Executing PTC code in sandbox',
        timestamp: Date.now(),
      });

      const sandboxResult = await this.sandbox.execute(ptcCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: this.sessionId,
        timeout: this.config.constraints?.timeout || 60000,
        metadata: {
          traceId: this.sessionId,
          task,
        },
      });

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
      const skillCalls = this.countSkillCalls(ptcCode);

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
