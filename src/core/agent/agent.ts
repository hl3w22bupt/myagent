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

  // Skill metadata registry (simplified version)
  private static skillsRegistry = [
    {
      name: 'web-search',
      description: 'Search the web for information',
      tags: ['web', 'search', 'research'],
    },
    {
      name: 'summarize',
      description: 'Summarize text content',
      tags: ['text', 'summarization', 'nlp'],
    },
    {
      name: 'code-analysis',
      description: 'Analyze code quality and patterns',
      tags: ['code', 'analysis', 'quality'],
    },
  ];

  constructor(config: AgentConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;

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
    if (!config.sandbox?.config) {
      throw new Error('Sandbox config is required in AgentConfig. Please provide sandbox.config.');
    }

    const adapterConfig = {
      type: config.sandbox.type || 'local',
      local: config.sandbox.config,
    };

    this.sandbox = SandboxFactory.create(adapterConfig);

    // Initialize PTC Generator
    this.ptcGenerator = new PTCGenerator(this.llm, Agent.skillsRegistry);

    // Initialize session state
    this.state = {
      sessionId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      conversationHistory: [],
      executionHistory: [],
      variables: new Map(),
    };
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
    };
  }
}
