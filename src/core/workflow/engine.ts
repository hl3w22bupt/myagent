/**
 * Workflow Engine
 *
 * Orchestrates multi-step workflows by calling agents
 */

import { AgentManager } from '../agent/manager';
import { WorkflowConfig, WorkflowOptions, WorkflowResult, WorkflowStep, OutputMapping } from './types';
import { WorkflowContext } from './context';
import { TemplateEngine } from '../config/template-engine';
import { setAgentStreams, getAgentStreams } from '../agent/hooks/progress-notify';
import { retryOperation, isDefaultRetryableError } from '../agent/retry';
import { ContextManager } from '../context/manager';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';
import { ArtifactCollector } from '../agent/artifact-collector';
import { AgentArtifacts } from '../agent/artifacts';
import { getDefaultWorkspace } from '../workspace/constants';

/**
 * Expand tilde (~) to home directory in file paths.
 * Node's path.join does NOT expand ~, so we must do it explicitly.
 */
function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return join(homedir(), filepath.slice(2));
  }
  if (filepath === '~') {
    return homedir();
  }
  return filepath;
}

export class WorkflowEngine {
  private agentManager: AgentManager;
  private workflows: Map<string, WorkflowConfig>;
  private failedWorkflows: Map<string, string>; // workflow name -> error message
  private streams: any = null;
  private logger: any;
  private internalExecutionSteps: any[] = [];  // ⭐ Track execution steps

  constructor(agentManager: AgentManager, logger: any = console) {
    this.agentManager = agentManager;
    this.workflows = new Map();
    this.failedWorkflows = new Map();
    this.logger = logger;
  }

  /**
   * Register a workflow configuration
   */
  registerWorkflow(name: string, config: WorkflowConfig): void {
    this.workflows.set(name, config);
    this.logger.debug(`[WorkflowEngine] Registered workflow: ${name}`);
  }

  /**
   * Register multiple workflows
   */
  registerWorkflows(workflows: Record<string, WorkflowConfig>): void {
    for (const [name, config] of Object.entries(workflows)) {
      this.registerWorkflow(name, config);
    }
  }

  /**
   * Get a workflow configuration
   */
  getWorkflow(name: string): WorkflowConfig | undefined {
    return this.workflows.get(name);
  }

  /**
   * Register a failed workflow (validation failed)
   */
  registerFailedWorkflow(name: string, error: string): void {
    this.failedWorkflows.set(name, error);
    this.logger.debug(`[WorkflowEngine] Registered failed workflow: ${name}`);
  }

  /**
   * Get failed workflow error message
   */
  getFailedWorkflowError(name: string): string | undefined {
    return this.failedWorkflows.get(name);
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): Array<{ name: string; config: WorkflowConfig }> {
    return Array.from(this.workflows.entries()).map(([name, config]) => ({ name, config }));
  }

  /**
   * Load subagent configuration from subagents/{name}/agent.yaml
   * Returns validation configuration and other subagent-specific settings
   */
  private loadSubagentConfig(subagentName: string): any {
    const subagentDir = join(process.cwd(), 'subagents', subagentName);
    const configPath = join(subagentDir, 'agent.yaml');

    if (!existsSync(configPath)) {
      this.logger.warn(`[WorkflowEngine] Subagent config not found: ${configPath}`);
      return null;
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const config = yaml.load(configContent) as any;

      // Extract validation configuration
      const subagentConfig: any = {
        name: subagentName,
        systemPrompt: config.agent?.system_prompt || config.agent?.systemPrompt,
        availableSkills: config.agent?.available_skills || config.agent?.availableSkills,
        constraints: config.agent?.constraints,
        validation: config.agent?.validation,  // ← 关键：提取 validation 配置
      };

      this.logger.info(`[WorkflowEngine] Loaded subagent config: ${subagentName}`, {
        hasValidation: !!subagentConfig.validation,
        validationStrategy: subagentConfig.validation?.strategy,
      });

      return subagentConfig;
    } catch (error: any) {
      this.logger.error(`[WorkflowEngine] Failed to load subagent config for ${subagentName}:`, error.message);
      return null;
    }
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflowName: string,
    input: Record<string, any>,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const workflow = this.workflows.get(workflowName);

    if (!workflow) {
      // Check if this workflow failed validation
      const failedError = this.failedWorkflows.get(workflowName);
      if (failedError) {
        return {
          success: false,
          error: `Workflow "${workflowName}" failed validation:\n${failedError}`,
          executionTime: 0,
          steps: [],
        };
      }

      return {
        success: false,
        error: `Workflow not found: ${workflowName}`,
        executionTime: 0,
        steps: [],
      };
    }

    // Validate input against schema
    this.validateInput(workflow, input);

    // Create execution context
    const context = new WorkflowContext(
      options.taskId || `workflow-${Date.now()}`,
      input
    );

    // Inject environment into context for template rendering
    // e.g. {{ environment.githubUrl }} in workflow YAML
    // Stored under variables so template resolves as {{ variables.environment.githubUrl }}
    if ((options as any).environment) {
      context.set('environment', (options as any).environment);
    }

    // ⭐ Resume support: load context from previous task if specified
    if (options.previousTaskId) {
      try {
        const contextManager = new ContextManager();
        const previousContext = await contextManager.getContext(options.previousTaskId);
        if (previousContext) {
          // Restore variables from previous context into workflow context
          if (previousContext.workingMemory) {
            for (const [key, value] of Object.entries(previousContext.workingMemory)) {
              context.set(key, value);
            }
          }
          // Restore artifact index for downstream steps
          if (previousContext.artifactIndex) {
            context.set('previousArtifacts', previousContext.artifactIndex);
          }
          this.logger.info('[WorkflowEngine] Restored context from previous task', {
            previousTaskId: options.previousTaskId,
            restoredKeys: previousContext.workingMemory ? Object.keys(previousContext.workingMemory) : [],
          });
        }
      } catch (err: any) {
        this.logger.warn('[WorkflowEngine] Failed to load previous task context, starting fresh', {
          previousTaskId: options.previousTaskId,
          error: err.message,
        });
      }
    }

    // ⭐ Resume support: inject feedback into context
    if (options.feedback) {
      context.set('feedback', options.feedback);
      this.logger.info('[WorkflowEngine] Injected feedback into workflow context', {
        feedback: options.feedback.substring(0, 100),
      });
    }

    // ⭐ Clear internal execution steps tracking
    this.internalExecutionSteps = [];
    let lastCompletedStepResult: any = null;  // Track the last completed step result

    try {
      // Execute steps in dependency order
      let sortedSteps = this.topologicalSort(workflow.steps);

      // ⭐ Resume support: if resumeFrom is specified, only execute from that step onwards
      if (options.resumeFrom) {
        sortedSteps = this.getStepsFrom(sortedSteps, options.resumeFrom);
        // Mark skipped steps as completed in context so downstream dependencies resolve
        const allSteps = this.topologicalSort(workflow.steps);
        for (const step of allSteps) {
          if (step.id === options.resumeFrom) break;
          context.setStepStatus(step.id, 'completed');
        }
        this.logger.info('[WorkflowEngine] Resuming workflow from step', {
          resumeFrom: options.resumeFrom,
          totalSteps: allSteps.length,
          resumedSteps: sortedSteps.length,
          skippedSteps: allSteps.length - sortedSteps.length,
        });
      }

      for (const step of sortedSteps) {
        // ⭐ Use executeStepWithRetry instead of executeStep
        const stepResult = await this.executeStepWithRetry(step, context, workflow, options);
        this.internalExecutionSteps.push(stepResult);

        // Track the last successfully completed step result
        // This will be used as the workflow's final output (like single agent)
        if (stepResult.status === 'completed') {
          lastCompletedStepResult = stepResult;
        }

        if (stepResult.status === 'failed' && !step.always_run) {
          break; // Stop on failure
        }
      }

      // Assemble final output from workflow.output config or fallback to last step
      let finalOutput: any;

      if (workflow.output && Object.keys(workflow.output).length > 0) {
        // Use workflow.output mapping to assemble final output from intermediate variables
        finalOutput = {};
        let hasAnyValue = false;
        for (const [name, mapping] of Object.entries(workflow.output)) {
          const fromPath = typeof mapping === 'string' ? mapping : mapping.from;
          const defaultValue = typeof mapping === 'object' ? mapping.default : undefined;
          const value = context.get(fromPath);
          finalOutput[name] = value !== undefined ? value : defaultValue;
          if (finalOutput[name] !== undefined) hasAnyValue = true;
        }

        // Log assembled output for debugging
        this.logger.debug('[WorkflowEngine] Assembled output from workflow.output config', {
          mappingKeys: Object.keys(workflow.output),
          assembledKeys: Object.keys(finalOutput),
          hasAnyValue,
          variables: context.getVariables(),
        });

        // If all values are undefined (e.g. steps didn't produce expected outputs),
        // fall back to last step's output
        if (!hasAnyValue && lastCompletedStepResult?.output) {
          const lastAgentResult = lastCompletedStepResult.output;
          finalOutput = lastAgentResult.structuredOutput || lastAgentResult.output || null;
          this.logger.info('[WorkflowEngine] Workflow.output mapping yielded no values, falling back to last step output');
        }
      } else {
        // Fallback: use the last completed step's agent output
        const lastAgentResult = lastCompletedStepResult?.output;
        finalOutput = lastAgentResult?.structuredOutput || lastAgentResult?.output || null;
      }

      // Check if any step failed
      const hasFailedStep = this.internalExecutionSteps.some(step => step.status === 'failed');
      const workflowSuccess = !hasFailedStep;

      this.logger.debug('[WorkflowEngine] Workflow execution completed', {
        workflowName: workflow.name,
        success: workflowSuccess,
        hasFailedStep,
        failedStepCount: this.internalExecutionSteps.filter(s => s.status === 'failed').length,
        finalOutputType: finalOutput ? (typeof finalOutput === 'object' ? 'structured' : 'text') : 'none',
        hasOutput: !!finalOutput,
        hasStructuredOutput: !!finalOutput,
        lastCompletedStep: lastCompletedStepResult?.stepId,
        variables: context.getVariables(),
      });

      // ⭐ Cleanup workspace
      // Only cleanup auto-generated workspace (no user-specified workspace)
      // User-specified workspace is always preserved
      const workflowWorkspace = context.get('variables.workflowWorkspace') as string;
      const workspaceAutoGenerated = context.get('variables.workspaceAutoGenerated') as boolean;

      if (workflowWorkspace && workspaceAutoGenerated) {
        const fs = await import('fs');
        try {
          if (fs.existsSync(workflowWorkspace)) {
            fs.rmSync(workflowWorkspace, { recursive: true, force: true });
            this.logger.info(`[WorkflowEngine] ✓ Cleaned up auto-generated workspace: ${workflowWorkspace}`);
          }
        } catch (error) {
          this.logger.warn(`[WorkflowEngine] Failed to cleanup workspace:`, error);
        }
      } else if (workflowWorkspace) {
        this.logger.info(`[WorkflowEngine] Preserving user-specified workspace: ${workflowWorkspace}`);
      }

      return {
        success: workflowSuccess,
        output: finalOutput,
        executionTime: Date.now() - startTime,
        steps: this.internalExecutionSteps,
        context: context.toJSON(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        steps: this.internalExecutionSteps,
        context: context.toJSON(),
      };
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    const startTime = Date.now();

    // Check if step should run (conditions)
    if (!this.shouldExecuteStep(step, context)) {
      return {
        stepId: step.id,
        status: 'skipped',
        reason: 'Condition not met',
        executionTime: Date.now() - startTime,
      };
    }

    // Check dependencies
    if (step.depends_on && !context.areDependenciesMet(step.id, step.depends_on)) {
      return {
        stepId: step.id,
        status: 'failed',
        error: `Dependencies not met`,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      this.logger.info(`[WorkflowEngine] Executing step: ${step.id}`, {
        type: step.type || 'agent',
        agent: step.agent,
        hasGitClone: !!step.gitClone,
      });

      // ⭐ Handle HITL step
      if (step.type === 'hitl') {
        return await this.executeHITLStep(step, context, workflow, options, startTime);
      }

      // Handle git-clone step
      if (step.type === 'git-clone') {
        return await this.executeGitCloneStep(step, context, options, startTime);
      }

      // Handle parallel execution
      if (step.parallel) {
        const result = await this.executeParallel(step, context, options);
        context.setStepStatus(step.id, 'completed');
        return {
          stepId: step.id,
          status: 'completed',
          executionTime: Date.now() - startTime,
          ...result,
        };
      }

      // Handle subworkflow call
      if (step.type === 'subworkflow' && step.subworkflow) {
        const result = await this.execute(step.subworkflow, step.input || {}, options);
        context.setStepStatus(step.id, result.success ? 'completed' : 'failed');
        return {
          stepId: step.id,
          status: result.success ? 'completed' : 'failed',
          output: result.output,
          executionTime: Date.now() - startTime,
        };
      }

      // Regular agent call - directly use the subagent
      const renderedInput = this.renderInput(step.input || {}, context);
      const taskDescription = this.formatTaskDescription(step, renderedInput, context, workflow);

      // Create a unique sessionId for each workflow step
      // This ensures each step has its own agent instance for proper trace aggregation
      const sessionId = `workflow-${workflow.name}-${step.id}-${options.taskId || Date.now()}`;

      // Build acquire options
      const acquireOptions: any = {};

      // Check if this step uses an external agent
      if (step.externalAgent) {
        // Use external agent type
        acquireOptions.agentType = 'external';
        acquireOptions.externalAgentConfig = step.externalAgent;

        this.logger.info(`[WorkflowEngine] Using external agent for step ${step.id}`, {
          type: step.externalAgent.type,
          protocol: step.externalAgent.protocol,
        });
      } else {
        // Use regular subagent
        acquireOptions.agentType = step.agent as 'agent' | 'master';
      }

      // Apply validation from workflow step configuration (primary source)
      if (step.validation) {
        acquireOptions.validation = step.validation;
        this.logger.info(`[WorkflowEngine] Applied step-level validation for ${step.agent}`, {
          strategy: step.validation.strategy,
          hasSchema: !!step.validation.schema,
          hasRequired: !!step.validation.required,
          hasFormats: !!step.validation.formats,
        });
      }

      // Acquire the subagent directly (not through MasterAgent)
      const agent = await this.agentManager.acquire(sessionId, acquireOptions);

      // Set agent name for trace display (e.g., "developer-engineer")
      (agent as any).agentName = step.agent;

      // Set hookManager to agent so it can trigger its own hooks
      const hookManager = this.agentManager.getHookManager();
      if (agent.setHookManager && hookManager) {
        agent.setHookManager(hookManager);
        this.logger.debug('[WorkflowEngine] HookManager set on agent', { sessionId, stepId: step.id });
      }

      // Set agent streams for progress notifications
      if (!this.streams) {
        this.streams = getAgentStreams();
      }
      // Only set global streams if this.streams is valid
      // Avoid clearing global streams with undefined
      if (this.streams) {
        setAgentStreams(this.streams);
      }

      // Call agent pre hook (onTaskStart)
      if (hookManager) {
        const agentContext = {
          agentType: step.agent,
          agentId: sessionId,
          sessionId,
          taskId: options.taskId,
          agent,
          workflowName: workflow.name,
          workflowStepId: step.id,
        };
        await hookManager.executeHook('onTaskStart', taskDescription, options.taskId, agentContext);
      }

      // Update LLM trace configuration before running
      agent.updateLLMTraceConfig(options.taskId);

      // ⭐ Ensure workspace exists for this workflow execution
      // Use a shared workspace across all steps in this workflow
      let workflowWorkspace = context.get('variables.workflowWorkspace') as string;
      console.log(`[WorkflowEngine] Step ${step.id} resolved workspace:`, { workflowWorkspace });
      if (!workflowWorkspace) {
        // Check if user explicitly provided a workspace
        const userWorkspace = (options as any).environment?.workspace;
        // 优先使用用户指定的 workspace，否则使用默认路径
        workflowWorkspace = userWorkspace
          || getDefaultWorkspace(options.taskId || Date.now().toString());

        // 记录 workspace 是否为系统自动生成的（用于后续清理判断）
        const isAutoGenerated = !userWorkspace;
        context.set('variables.workspaceAutoGenerated', isAutoGenerated);

        this.logger.info(`[WorkflowEngine] Creating workflow workspace: ${workflowWorkspace}`, {
          userProvided: !!userWorkspace,
          autoGenerated: isAutoGenerated,
        });

        // Ensure workspace directory exists
        const fs = await import('fs');
        if (!fs.existsSync(workflowWorkspace)) {
          fs.mkdirSync(workflowWorkspace, { recursive: true });
          this.logger.info(`[WorkflowEngine] ✓ Workspace created: ${workflowWorkspace}`);
        }

        // Store in context for subsequent steps
        context.set('variables.workflowWorkspace', workflowWorkspace);
      }

      // Run the agent directly
      const result = await agent.run(taskDescription, options.taskId, {
        ...options,
        environment: {
          ...(options as any).environment || {},
          workspace: workflowWorkspace,  // ⭐ Pass workspace to Agent
        },
        workflowName: workflow.name,
        workflowStepId: step.id,
        // Pass rendered input as context for the agent
        workflowInput: renderedInput,
        // Disable request rewriting for workflow execution (no conversation history)
        rewriteRequest: false,
        parentSessionId: options.parentSessionId,  // Pass parent session for trace grouping
      });

      // Call agent post hook (onTaskComplete)
      if (hookManager) {
        const agentContext = {
          agentType: step.agent,
          agentId: sessionId,
          sessionId,
          taskId: options.taskId,
          agent,
          workflowName: workflow.name,
          workflowStepId: step.id,
        };
        await hookManager.executeHook('onTaskComplete', result, agentContext);
      }

      // Extract outputs
      if (step.output) {
        this.extractOutputs(result, step.output, context);
      }

      // ⭐ 处理产物信息
      // 1. 如果 Agent 已经返回 artifacts，直接使用
      // 2. 如果有 fileOperations 但没有 artifacts，自动转换
      // 3. 如果有 workspace 但没有产物信息，扫描 workspace
      let artifacts = result.artifacts;

      if (!artifacts && result.metadata?.fileOperations) {
        // 从 fileOperations 转换
        artifacts = ArtifactCollector.fromFileOperations(
          result.metadata.fileOperations,
          result.metadata.workspace
        );
        result.artifacts = artifacts;  // 缓存到 result 中
      } else if (!artifacts && result.metadata?.workspace) {
        // 扫描 workspace（可选，性能考虑）
        // 这里暂时不自动扫描，避免性能问题
        // 如果需要，可以在 workflow yaml 中配置 scanWorkspace: true
      }

      // 保存产物到 context，供下一个 step 使用
      if (artifacts) {
        // 保存到 variables 中
        context.set(`variables.steps.${step.id}.artifacts`, artifacts);
        context.set(`variables.${step.id}.artifacts`, artifacts);  // 简写
      }

      context.setStepStatus(step.id, 'completed');

      return {
        stepId: step.id,
        status: 'completed',
        output: result,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(`[WorkflowEngine] Step ${step.id} failed with error`, {
        type: step.type,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3),
      });

      // Emit failure trace for this step
      await this.emitStepTrace({
        taskId: options.taskId,
        stepId: step.id,
        stepType: step.type || 'agent',
        stepName: step.name,
        stage: 'post',
        status: 'failed',
        error: error.message,
        executionTime: Date.now() - startTime,
      });

      context.setStepStatus(step.id, 'failed');
      // Handle failure based on on_failure configuration
      return await this.handleStepFailure(step, context, workflow, options, error);
    }
  }

  /**
   * Execute parallel iterations
   */
  private async executeParallel(
    step: WorkflowStep,
    context: WorkflowContext,
    options: WorkflowOptions
  ): Promise<any> {
    if (!step.parallel) return {};

    const iterations = step.parallel.iterations || [];
    const concurrency = step.parallel.concurrency || iterations.length;
    const results: any[] = [];

    // Execute with concurrency limit
    for (let i = 0; i < iterations.length; i++) {
      const batch = iterations.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (iteration, index) => {
          if (!step.agent) {
            throw new Error(`Step ${step.id} does not have an agent configured`);
          }
          const agent = await this.agentManager.acquire(step.agent);

          // Create context for this iteration
          context.setLoopIteration(iteration, i + index);

          const renderedInput = this.renderInput(step.input || {}, context);
          const result = await agent.run(JSON.stringify(renderedInput), options.taskId);

          return {
            iteration,
            index: i + index,
            result,
          };
        })
      );

      results.push(...batchResults);
      i += concurrency - 1;
    }

    // Merge results
    if (step.parallel.merge_to) {
      for (const { iteration, result } of results) {
        const targetPath = step.parallel.merge_to.replace('{{ iteration.lang }}', iteration.lang);
        context.set(targetPath, result);
      }
    }

    return { results };
  }

  /**
   * Extract outputs from agent result
   */
  private extractOutputs(
    agentResult: any,
    outputConfig: Record<string, string | OutputMapping>,
    context: WorkflowContext
  ): void {
    for (const [varName, mapping] of Object.entries(outputConfig)) {
      let fromPath: string;
      let defaultValue: any;

      if (typeof mapping === 'string') {
        fromPath = mapping;
      } else if (typeof mapping === 'object' && mapping.from) {
        fromPath = mapping.from;
        defaultValue = mapping.default;
      } else {
        continue;
      }

      // Extract value from agent result
      const value = this.extractFromAgentResult(agentResult, fromPath, defaultValue);

      // Set to workflow output if varName is 'output'
      if (varName === 'output' || varName.startsWith('output.')) {
        const outputPath = varName === 'output' ? 'output' : varName;
        context.set(outputPath, value);
      } else {
        // Set as intermediate variable
        context.set(varName, value);
      }
    }
  }

  /**
   * Extract value from agent result using path
   */
  private extractFromAgentResult(result: any, path: string, defaultValue: any): any {
    if (!result) return defaultValue;

    // Direct value from output
    if (path === 'output') {
      return result.output || defaultValue;
    }

    // Direct value from structuredOutput (entire object)
    // For external agents that don't produce structuredOutput, fall back to parsing output text
    if (path === 'structuredOutput') {
      if (result.structuredOutput !== undefined) {
        return result.structuredOutput;
      }
      // External agent fallback: try parsing output as JSON
      if (result.output && typeof result.output === 'string') {
        try {
          return JSON.parse(result.output);
        } catch {
          return result.output;  // Return raw text if not valid JSON
        }
      }
      if (result.output !== undefined) {
        return result.output;
      }
      return defaultValue;
    }

    // Extract from structuredOutput nested properties
    if (path.startsWith('structuredOutput.')) {
      const parts = path.substring('structuredOutput.'.length).split('.');
      const value = parts.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), result.structuredOutput);
      return value !== undefined ? value : defaultValue;
    }

    // Extract from metadata
    if (path.startsWith('metadata.')) {
      const parts = path.substring('metadata.'.length).split('.');
      const value = parts.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), result.metadata);
      return value !== undefined ? value : defaultValue;
    }

    // Direct value from metadata (entire object)
    if (path === 'metadata') {
      return result.metadata !== undefined ? result.metadata : defaultValue;
    }

    // Default: extract from structuredOutput root (legacy behavior)
    const parts = path.split('.');
    const value = parts.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), result.structuredOutput);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Extract value from workflow variables using path
   * Supports dot notation for nested properties
   */
  private extractFromVariables(variables: Record<string, any>, path: string, defaultValue: any): any {
    if (!variables) return defaultValue;

    // Path may contain dots for nested access
    const parts = path.split('.');
    let value: any = variables;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Render input template with context variables
   */
  private renderInput(input: Record<string, any>, context: WorkflowContext): Record<string, any> {
    const template = new TemplateEngine(context.toJSON() as any);
    return template.render(input);
  }

  /**
   * Format task as natural language description from rendered input
   * ⭐ 增强：自动注入依赖 step 的产物信息
   */
  private formatTaskDescription(
    step: WorkflowStep,
    renderedInput: Record<string, any>,
    context: WorkflowContext,
    _workflow: WorkflowConfig
  ): string {
    const parts: string[] = [step.name || step.id];

    // ⭐ 自动添加依赖 step 的产物信息
    if (step.depends_on && step.depends_on.length > 0) {
      const artifactsInfo = this.buildArtifactsInfoFromDependencies(step.depends_on, context);
      if (artifactsInfo) {
        parts.push(artifactsInfo);
      }
    }

    // Add input values
    for (const [key, value] of Object.entries(renderedInput)) {
      if (value !== undefined && value !== null) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        parts.push(`${key}: ${valueStr}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * 从依赖的 steps 构建产物信息
   */
  private buildArtifactsInfoFromDependencies(
    dependencies: string[],
    context: WorkflowContext
  ): string | null {
    const infoParts: string[] = [];

    for (const depStepId of dependencies) {
      // 获取产物信息（从 variables 中获取）
      const artifacts = context.get(`variables.steps.${depStepId}.artifacts`) as AgentArtifacts;

      if (!artifacts || !artifacts.allFiles || artifacts.allFiles.length === 0) {
        continue;
      }

      infoParts.push(`\n[Previous step: ${depStepId}]`);

      if (artifacts.workspace) {
        infoParts.push(`Workspace: ${artifacts.workspace}`);
      }

      infoParts.push(`Files created (${artifacts.allFiles.length}):`);

      // 按类型分组显示
      for (const [type, files] of Object.entries(artifacts.files || {})) {
        if (files && (files as any[]).length > 0) {
          infoParts.push(`  ${type} (${(files as any[]).length}):`);
          for (const file of files as any[]) {
            infoParts.push(`    - ${file.relativePath || file.name}`);
          }
        }
      }

      // 添加统计信息
      if (artifacts.summary) {
        infoParts.push(`Summary: ${artifacts.summary.totalFiles} files, ${artifacts.summary.totalSize} bytes`);
      }
    }

    return infoParts.length > 0 ? infoParts.join('\n') : null;
  }

  /**
   * Check if step should execute based on conditions
   */
  private shouldExecuteStep(step: WorkflowStep, context: WorkflowContext): boolean {
    if (!step.condition && !step.conditions) return true;

    const conditions = step.conditions
      ? (step.condition ? { ...step.conditions, single: step.condition } : step.conditions)
      : (step.condition ? { all: [step.condition] } : null);

    if (!conditions) return true;

    // Check all
    if (conditions.all && !this.evaluateConditions(conditions.all, context).every(r => r)) {
      return false;
    }

    // Check any
    if (conditions.any && !this.evaluateConditions(conditions.any, context).some(r => r)) {
      return false;
    }

    // Check none
    if (conditions.none && this.evaluateConditions(conditions.none, context).some(r => r)) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate conditions
   */
  private evaluateConditions(conditions: any[], context: WorkflowContext): boolean[] {
    return conditions.map(cond => {
      const actualValue = context.get(cond.field);
      return this.compare(actualValue, cond.operator, cond.value);
    });
  }

  /**
   * Compare values
   */
  private compare(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '==': return actual == expected;
      case '!=': return actual != expected;
      case '>': return actual > expected;
      case '<': return actual < expected;
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
      default: return false;
    }
  }

  /**
   * Validate input against schema
   */
  private validateInput(workflow: WorkflowConfig, input: Record<string, any>): void {
    if (!workflow.input_schema) return;

    for (const [key, schema] of Object.entries(workflow.input_schema)) {
      // Check required fields
      if (schema.required && !(key in input)) {
        throw new Error(`Missing required input: ${key}`);
      }

      // Use default value if missing
      if (!(key in input) && schema.default !== undefined) {
        input[key] = schema.default;
      }

      // Type validation
      if (key in input) {
        const value = input[key];
        const validType = this.validateType(value, schema.type);
        if (!validType) {
          throw new Error(`Invalid type for ${key}: expected ${schema.type}, got ${typeof value}`);
        }
      }
    }
  }

  /**
   * Validate value type
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return true;
    }
  }

  /**
   * Topological sort of steps based on dependencies
   */
  private topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
    const sorted: WorkflowStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string): void => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Cyclic dependency detected at step: ${stepId}`);
      }

      visiting.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (!step) return;

      const deps = step.depends_on || [];
      for (const dep of deps) {
        visit(dep);
      }

      visiting.delete(stepId);
      visited.add(stepId);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return sorted;
  }

  /**
   * Get workflow status
   */
  async getStatus(taskId: string): Promise<any> {
    // TODO: Implement status tracking
    return { taskId, status: 'unknown' };
  }

  // =========================================================================
  // ⭐ WORKFLOW FEEDBACK LOOP METHODS
  // =========================================================================

  /**
   * Execute step with retry and failure handling
   * This is the main entry point for feedback loop functionality
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    // If retry is configured, use retry logic
    if (step.retry && step.retry.maxRetries && step.retry.maxRetries > 0) {
      return await this.executeStepWithRetryLogic(step, context, workflow, options);
    }

    // Otherwise, execute directly
    return await this.executeStep(step, context, workflow, options);
  }

  /**
   * Execute step with retry logic
   */
  private async executeStepWithRetryLogic(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    const retryConfig = {
      maxRetries: step.retry?.maxRetries || 0,
      baseDelay: step.retry?.delayMs || 1000,
      maxDelay: step.retry?.maxDelayMs || 30000,
      exponentialBackoff: step.retry?.exponentialBackoff !== false,
      jitterFactor: step.retry?.jitterFactor || 0.1,
    };

    const result = await retryOperation(
      async () => await this.executeStep(step, context, workflow, options),
      {
        ...retryConfig,
        isRetryable: step.retry?.isRetryable || isDefaultRetryableError,
      }
    );

    if (result.success) {
      return result.data;
    }

    // All retries exhausted, handle failure
    const failureError = result.error || new Error('Step failed after retries');
    return await this.handleStepFailure(step, context, workflow, options, failureError);
  }

  /**
   * Handle step failure
   * Determines what to do when a step fails based on on_failure configuration
   */
  private async handleStepFailure(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions,
    error: Error
  ): Promise<any> {
    this.logger.warn('[WorkflowEngine] Step failed', {
      stepId: step.id,
      error: error.message,
    });

    const handler = step.on_failure || 'abort';  // Default: abort workflow

    switch (handler) {
      case 'retry':
        // This shouldn't normally happen (retries are in executeStepWithRetryLogic)
        // But if on_failure: retry is set without retry config, try once more
        this.logger.info('[WorkflowEngine] Retry requested without retry config, executing once');
        return await this.executeStep(step, context, workflow, options);

      case 'skip':
        // Skip this step and continue
        this.logger.info('[WorkflowEngine] Skipping failed step', { stepId: step.id });
        return {
          stepId: step.id,
          status: 'skipped',
          reason: 'Failed and skipped',
          error: error.message,
        };

      case 'rollback':
        // Rollback to specified step
        return await this.handleRollback(step, context, workflow, options);

      case 'hitl':
        // Request Human-In-The-Loop
        return await this.handleHITL(step, context, workflow, options, error);

      default:
        // Abort workflow
        throw new Error(`Step ${step.id} failed: ${error.message}`);
    }
  }

  /**
   * Handle rollback to a previous step
   */
  private async handleRollback(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    // Get rollback configuration
    const rollbackConfig = step.rollbackConfig;
    if (!rollbackConfig?.targetStepId) {
      throw new Error(`Rollback requested but no targetStepId specified for step ${step.id}`);
    }

    const targetStep = workflow.steps.find(s => s.id === rollbackConfig.targetStepId);
    if (!targetStep) {
      throw new Error(`Rollback target step not found: ${rollbackConfig.targetStepId}`);
    }

    this.logger.info('[WorkflowEngine] Rolling back to step', {
      from: step.id,
      to: rollbackConfig.targetStepId,
      clearContext: rollbackConfig.clearContext,
    });

    // Clear context if configured
    if (rollbackConfig.clearContext) {
      // WorkflowContext doesn't have clear(), so we create a new one
      const newContext = new WorkflowContext(context['workflowId'] + '-reset', {});
      Object.assign(context, newContext);
      this.logger.debug('[WorkflowEngine] Context cleared before rollback');
    }

    // Get steps from target step onwards (including target step)
    const stepsFromTarget = this.getStepsFrom(workflow.steps, rollbackConfig.targetStepId);

    // Re-execute from target step
    for (const stepToExecute of stepsFromTarget) {
      const stepResult = await this.executeStepWithRetry(stepToExecute, context, workflow, options);
      this.internalExecutionSteps.push(stepResult);

      // Stop if step failed and not always_run
      if (stepResult.status === 'failed' && !stepToExecute.always_run) {
        this.logger.warn('[WorkflowEngine] Step failed during rollback re-execution', {
          stepId: stepToExecute.id
        });
        break;
      }
    }

    return {
      stepId: step.id,
      status: 'completed',  // Rollback itself completed
      rollbackTo: rollbackConfig.targetStepId,
      message: `Rolled back to ${rollbackConfig.targetStepId} and re-executed`,
    };
  }

  /**
   * Handle HITL (Human-In-The-Loop)
   * Saves HITL state, polls for response, and executes action
   */
  private async handleHITL(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions,
    error: Error
  ): Promise<any> {
    this.logger.info('[WorkflowEngine] Requesting HITL', {
      stepId: step.id,
      workflowName: workflow.name,
      error: error.message,
    });

    // Build question for human
    const question = step.hitl?.question || `步骤 "${step.name || step.id}" 执行失败：\n\n${error.message}\n\n请选择处理方式：`;

    // Get HITL options (with defaults)
    const defaultHITLOptions = [
      {
        id: 'retry',
        label: '重试',
        description: '重新执行此步骤',
        action: 'retry' as const,
        params: { stepId: step.id },
      },
      {
        id: 'skip',
        label: '跳过',
        description: '跳过此步骤，继续下一步',
        action: 'skip' as const,
        params: { stepId: step.id },
      },
      {
        id: 'abort',
        label: '中止',
        description: '中止整个工作流',
        action: 'abort' as const,
        params: { stepId: step.id },
      },
    ];

    const hitlOptions = step.hitl?.options || defaultHITLOptions;

    // Save HITL state to TaskContext (reuse existing mechanism)
    const contextManager = new ContextManager();
    const taskId = options.taskId || `workflow-${Date.now()}`;

    // Get existing context and update it
    const existingContext = await contextManager.getContext(taskId);
    if (existingContext) {
      // Create HITL state with workflow-specific fields
      const hitlState: any = {
        stage: 'in_execution',  // Workflow is executing when failure occurs
        status: 'awaiting',
        agentName: `Workflow:${workflow.name}`,
        question,
        options: hitlOptions.map(opt => opt.label),
        createdAt: new Date(),
        // Workflow-specific fields
        workflowName: workflow.name,
        stepId: step.id,
        failureReason: error.message,
        retryAttempt: 0,
      };

      existingContext.hitlState = hitlState;
      await contextManager.saveContext(existingContext);
    } else {
      // If no context exists, create a new one
      this.logger.warn('[WorkflowEngine] No existing context found, HITL may not work properly', { taskId });
    }

    // Send notification via Stream (reuse existing mechanism)
    const streams = getAgentStreams();
    if (streams?.taskExecution) {
      const event = {
        type: 'awaiting_clarification',  // Reuse existing type
        progressType: 'hitl',
        status: 'awaiting_clarification',
        taskId,
        sessionId: options.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          workflowName: workflow.name,
          stepId: step.id,
          question,
          options: hitlOptions,
          error: error.message,
        }
      };

      const groupId = taskId;
      const timestamp = Date.now();
      const entryId = `workflow-hitl-${groupId}-${timestamp}`;

      await streams.taskExecution.set(groupId, entryId, {
        ...event,
        category: 'workflow_hook',
      });

      this.logger.debug('[WorkflowEngine] HITL notification sent', { taskId, stepId: step.id });
    }

    // Poll for HITL response (reuse Agent polling logic)
    const pollInterval = step.hitl?.pollInterval || 10000;  // 10 seconds
    const timeout = step.hitl?.timeout || (7 * 24 * 60 * 60 * 1000);  // 7 days
    const startTime = Date.now();

    this.logger.info('[WorkflowEngine] Starting HITL polling', {
      stepId: step.id,
      pollInterval,
      timeout,
    });

    while (Date.now() - startTime < timeout) {
      try {
        const updatedContext = await contextManager.getContext(taskId);

        if (updatedContext?.hitlState?.status === 'completed' && updatedContext.hitlState.response) {
          this.logger.info('[WorkflowEngine] HITL response received', {
            taskId,
            response: updatedContext.hitlState.response,
          });

          // Clear HITL state (use delete like Agent does)
          const contextToClear = await contextManager.getContext(taskId);
          if (contextToClear && contextToClear.hitlState) {
            delete contextToClear.hitlState;
            await contextManager.saveContext(contextToClear);
          }

          // Execute action based on response
          return await this.executeHITLAction(step, context, workflow, options, updatedContext.hitlState.response);
        }

        // Still awaiting, wait and retry
        this.logger.debug('[WorkflowEngine] Still waiting for HITL', {
          stepId: step.id,
          elapsed: Date.now() - startTime,
        });
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (pollError) {
        this.logger.error('[WorkflowEngine] Error polling HITL status', {
          stepId: step.id,
          error: pollError,
        });
        // Wait and retry on error
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    // Timeout - abort workflow
    this.logger.warn('[WorkflowEngine] HITL timeout, aborting workflow', {
      stepId: step.id,
      timeout,
    });

    return {
      stepId: step.id,
      status: 'failed',
      error: `HITL timeout after ${timeout}ms`,
    };
  }

  /**
   * Execute action after HITL response
   */
  private async executeHITLAction(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions,
    response: any
  ): Promise<any> {
    // The response from the API is in the format: { content: string, feedback?: string, timestamp: Date }
    // For workflow HITL, we expect content to be JSON: { action: string, params?: any }
    // For Agent HITL, content is plain text

    const responseContent = response?.content || '';
    let action: string;
    let params: any = {};

    // Try to parse as JSON (for workflow HITL)
    try {
      const parsed = JSON.parse(responseContent);
      action = parsed.action || 'abort';
      params = parsed.params || {};
    } catch {
      // Not JSON, treat as plain text (for Agent HITL compatibility)
      // Map common text responses to actions
      const lowerContent = responseContent.toLowerCase();
      if (lowerContent.includes('retry') || lowerContent.includes('重试') || lowerContent.includes('再试') || lowerContent.includes('重新生成') || lowerContent.includes('重新') || lowerContent.includes('再次')) {
        action = 'retry';
      } else if (lowerContent.includes('skip') || lowerContent.includes('跳过')) {
        action = 'skip';
      } else if (lowerContent.includes('rollback') || lowerContent.includes('回滚')) {
        action = 'rollback';
      } else {
        action = 'abort';
      }
    }

    switch (action) {
      case 'retry': {
        this.logger.info('[WorkflowEngine] Retrying step after HITL', {
          stepId: step.id,
          response: responseContent,
          feedback: response?.feedback,
        });

        // Simply re-execute the step (it will use the same agent instance)
        // In a real implementation, you might want to pass the feedback to the agent
        return await this.executeStep(step, context, workflow, options);
      }

      case 'skip': {
        this.logger.info('[WorkflowEngine] Skipping step after HITL', {
          stepId: step.id,
          response: responseContent,
        });
        return {
          stepId: step.id,
          status: 'skipped',
          reason: 'Skipped after HITL',
        };
      }

      case 'rollback': {
        const targetStepId = params?.targetStepId;
        if (!targetStepId) {
          throw new Error('Rollback action requires targetStepId in params');
        }

        this.logger.info('[WorkflowEngine] Rolling back after HITL', {
          stepId: step.id,
          targetStepId,
          response: responseContent,
        });

        // Create temporary rollback config
        const rollbackConfig = {
          targetStepId,
          clearContext: false,
        };

        // Temporarily set rollbackConfig on step
        const originalRollbackConfig = step.rollbackConfig;
        step.rollbackConfig = rollbackConfig;

        const result = await this.handleRollback(step, context, workflow, options);

        // Restore original rollbackConfig
        step.rollbackConfig = originalRollbackConfig;

        return result;
      }

      case 'abort':
      default: {
        this.logger.info('[WorkflowEngine] Aborting workflow after HITL', {
          stepId: step.id,
          reason: response?.feedback || responseContent,
        });
        throw new Error(`Workflow aborted after HITL: ${response?.feedback || responseContent}`);
      }
    }
  }

  /**
   * Get steps starting from a specific step (inclusive)
   * Used for rollback re-execution
   */
  private getStepsFrom(allSteps: WorkflowStep[], fromStepId: string): WorkflowStep[] {
    const fromIndex = allSteps.findIndex(s => s.id === fromStepId);
    if (fromIndex === -1) {
      throw new Error(`Step not found: ${fromStepId}`);
    }

    // Return all steps from target step onwards
    return allSteps.slice(fromIndex);
  }

  /**
   * Execute git-clone step
   * Clones a repository into the workspace using deterministic shell commands
   */
  private async executeGitCloneStep(
    step: WorkflowStep,
    context: WorkflowContext,
    options: WorkflowOptions,
    startTime: number
  ): Promise<any> {
    const gitConfig = step.gitClone;
    const taskId = options.taskId;
    console.log(`[WorkflowEngine] executeGitCloneStep called`, { stepId: step.id, hasGitClone: !!gitConfig });

    // Emit pre-trace
    await this.emitStepTrace({
      taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
      stage: 'pre', status: 'started',
      inputData: { url: gitConfig?.url, branch: gitConfig?.branch },
    });

    if (!gitConfig) {
      console.log(`[WorkflowEngine] git-clone step missing gitClone config`);
      const errorMsg = 'git-clone step missing gitClone configuration';
      await this.emitStepTrace({
        taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
        stage: 'post', status: 'failed', error: errorMsg,
        executionTime: Date.now() - startTime,
      });
      return {
        stepId: step.id,
        status: 'failed',
        error: errorMsg,
        executionTime: Date.now() - startTime,
      };
    }

    // Render template variables in git config
    const rendered = this.renderInput({
      url: gitConfig.url,
      token: gitConfig.token,
      branch: gitConfig.branch,
      targetDir: gitConfig.targetDir,
    }, context);

    const url = rendered.url as string;
    const token = rendered.token as string | undefined;
    const branch = rendered.branch as string | undefined;
    const targetDir = rendered.targetDir as string | undefined;

    if (!url) {
      console.log(`[WorkflowEngine] git-clone: url is empty`, { rendered });
      const errorMsg = 'git-clone: url is required (set environment.githubUrl)';
      await this.emitStepTrace({
        taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
        stage: 'post', status: 'failed', error: errorMsg,
        inputData: { rendered },
        executionTime: Date.now() - startTime,
      });
      return {
        stepId: step.id,
        status: 'failed',
        error: errorMsg,
        executionTime: Date.now() - startTime,
      };
    }

    // Ensure workspace directory exists
    let workspaceDir = context.get('variables.workflowWorkspace') as string;
    if (!workspaceDir) {
      const userWorkspace = (options as any).environment?.workspace;
      workspaceDir = userWorkspace
        ? expandTilde(userWorkspace)
        : getDefaultWorkspace(options.taskId || Date.now().toString());
      context.set('variables.workspaceAutoGenerated', !userWorkspace);
      context.set('variables.workflowWorkspace', workspaceDir);

      const fs = await import('fs');
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
    }

    // Build clone target path
    // targetDir can be: absolute path (~/...), relative name, or omitted
    const expandedTargetDir = targetDir ? expandTilde(targetDir) : undefined;
    const repoDirName = expandedTargetDir || this.extractRepoName(url);
    const path = await import('path');
    const isAbsolutePath = repoDirName.startsWith('/');
    const cloneDir = isAbsolutePath ? repoDirName : path.join(workspaceDir, repoDirName);

    // Build authenticated URL
    const authUrl = token ? this.injectToken(url, token) : url;

    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const useWorktree = gitConfig.useWorktree !== false; // default: true

    // Check if target directory already exists and is a git repo
    const gitDir = path.join(cloneDir, '.git');
    const isExistingRepo = fs.existsSync(gitDir);

    let finalWorkDir = cloneDir;
    let effectiveBranch = branch || 'main';

    if (isExistingRepo) {
      // Repo already exists - handle based on useWorktree setting
      if (useWorktree) {
        // Generate branch name from task content
        const taskContent = context.get('input.requirement') as string
                        || context.get('variables.originalTask') as string
                        || options.taskId || '';
        const worktreeBranch = await this.generateWorktreeBranch(taskContent);
        const worktreePath = path.join(cloneDir, '..', `${repoDirName}-${worktreeBranch}`);

        this.logger.info(`[WorkflowEngine] git-clone: repo exists, creating worktree`, {
          existingRepo: cloneDir,
          worktreeBranch,
          worktreePath,
        });

        try {
          // Fetch latest
          execSync(`git fetch origin`, { cwd: cloneDir, stdio: 'pipe', timeout: 60000 });

          // Resolve the actual default branch from remote
          const baseBranch = branch || await this.detectDefaultBranch(cloneDir);
          execSync(`git worktree add ${worktreePath} -b ${worktreeBranch} origin/${baseBranch}`, {
            cwd: cloneDir, stdio: 'pipe', timeout: 60000,
          });

          // Configure git credential in worktree
          if (token) {
            try {
              const credentialUrl = url.replace(/^(https?:\/\/)/, `$1x-access-token:${token}@`);
              execSync(`git remote set-url origin ${credentialUrl}`, { cwd: worktreePath, stdio: 'pipe' });
            } catch (credError: any) {
              console.warn(`[WorkflowEngine] git-clone: failed to configure remote URL in worktree`, { error: credError.message });
            }
          }

          finalWorkDir = worktreePath;
          effectiveBranch = worktreeBranch;

          this.logger.info(`[WorkflowEngine] git-clone: worktree created`, {
            worktreePath,
            branch: worktreeBranch,
            baseBranch,
          });
        } catch (wtError: any) {
          const errMsg = wtError.stderr?.toString() || wtError.message;
          // Worktree creation failed - create a new branch in existing repo instead
          this.logger.warn(`[WorkflowEngine] git-clone: worktree creation failed, creating new branch in existing repo`, {
            error: errMsg,
          });

          // Fallback: create a new branch from remote default so we don't work on main directly
          const baseBranch = branch || await this.detectDefaultBranch(cloneDir);
          try {
            execSync(`git fetch origin`, { cwd: cloneDir, stdio: 'pipe', timeout: 60000 });
            execSync(`git checkout -b ${worktreeBranch} origin/${baseBranch}`, { cwd: cloneDir, stdio: 'pipe', timeout: 30000 });
            // Successfully created branch in existing repo
            effectiveBranch = worktreeBranch;
            this.logger.info(`[WorkflowEngine] git-clone: created branch ${worktreeBranch} in existing repo`, {
              cwd: cloneDir,
              baseBranch,
            });
          } catch (checkoutError: any) {
            // Branch might already exist, try checking it out
            this.logger.warn(`[WorkflowEngine] git-clone: branch creation failed, trying checkout`, {
              error: checkoutError.stderr?.toString() || checkoutError.message,
            });
            try {
              execSync(`git checkout ${worktreeBranch}`, { cwd: cloneDir, stdio: 'pipe', timeout: 30000 });
              effectiveBranch = worktreeBranch;
            } catch (fallbackError: any) {
              // All fallbacks failed - still on main, but at least we tried
              this.logger.error(`[WorkflowEngine] git-clone: all branch attempts failed, staying on current branch`, {
                error: fallbackError.stderr?.toString() || fallbackError.message,
              });
            }
          }
        }
      } else {
        // useWorktree: false - work directly in existing repo
        this.logger.info(`[WorkflowEngine] git-clone: repo exists, useWorktree=false, reusing`, {
          existingRepo: cloneDir,
        });

        try {
          execSync(`git fetch origin`, { cwd: cloneDir, stdio: 'pipe', timeout: 60000 });
          const defaultBranch = branch || await this.detectDefaultBranch(cloneDir);
          execSync(`git checkout ${defaultBranch}`, { cwd: cloneDir, stdio: 'pipe', timeout: 30000 });
        } catch (fetchError: any) {
          this.logger.warn(`[WorkflowEngine] git-clone: fetch/checkout failed, using repo as-is`, {
            error: fetchError.stderr?.toString() || fetchError.message,
          });
        }
      }

      // Store clone info and update workspace
      context.set('variables.gitCloned', true);
      context.set('variables.gitRepoDir', finalWorkDir);
      context.set('variables.gitBranch', effectiveBranch);
      context.set('variables.workflowWorkspace', finalWorkDir);
      if (finalWorkDir !== cloneDir) {
        context.set('variables.isWorktree', true);
        context.set('variables.worktreeBaseRepo', cloneDir);
      }

      context.setStepStatus(step.id, 'completed');

      const resultOutput = {
        cloneDir: finalWorkDir,
        branch: effectiveBranch,
        repoUrl: url,
        isWorktree: finalWorkDir !== cloneDir,
        baseRepo: finalWorkDir !== cloneDir ? cloneDir : undefined,
      };

      this.logger.info(`[WorkflowEngine] git-clone completed (existing repo)`, resultOutput);

      await this.emitStepTrace({
        taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
        stage: 'post', status: 'completed', outputData: resultOutput,
        executionTime: Date.now() - startTime,
      });

      return {
        stepId: step.id,
        status: 'completed',
        output: resultOutput,
        executionTime: Date.now() - startTime,
      };
    }

    // Fresh clone - target doesn't exist
    const branchArg = branch ? ` --branch ${branch}` : '';
    const cloneCmd = `git clone --depth 1${branchArg} ${authUrl} ${cloneDir}`;

    this.logger.info(`[WorkflowEngine] git-clone step: cloning repository`, {
      url: url.replace(/\/\/.*@/, '//***@'),
      branch: branch || 'default',
      targetDir: cloneDir,
    });

    try {
      execSync(cloneCmd, { stdio: 'pipe', timeout: 120000 });

      // Configure git credential for push operations
      if (token) {
        try {
          const credentialUrl = url.replace(/^(https?:\/\/)/, `$1x-access-token:${token}@`);
          execSync(`git remote set-url origin ${credentialUrl}`, { cwd: cloneDir, stdio: 'pipe' });
        } catch (credError: any) {
          console.warn(`[WorkflowEngine] git-clone: failed to configure remote URL`, { error: credError.message });
        }
      }

      context.set('variables.gitCloned', true);
      context.set('variables.gitRepoDir', cloneDir);
      context.set('variables.gitBranch', branch || effectiveBranch || 'main');
      context.set('variables.workflowWorkspace', cloneDir);

      context.setStepStatus(step.id, 'completed');

      const resultOutput = { cloneDir, branch: branch || 'default', repoUrl: url };

      await this.emitStepTrace({
        taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
        stage: 'post', status: 'completed', outputData: resultOutput,
        executionTime: Date.now() - startTime,
      });

      return {
        stepId: step.id,
        status: 'completed',
        output: resultOutput,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      const errMsg = error.stderr?.toString() || error.message;
      context.setStepStatus(step.id, 'failed');

      this.logger.error(`[WorkflowEngine] git-clone failed`, { error: errMsg });

      await this.emitStepTrace({
        taskId, stepId: step.id, stepType: 'git-clone', stepName: step.name,
        stage: 'post', status: 'failed', error: `git clone failed: ${errMsg}`,
        executionTime: Date.now() - startTime,
      });

      return {
        stepId: step.id,
        status: 'failed',
        error: `git clone failed: ${errMsg}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  // =========================================================================
  // ⭐ WORKFLOW STEP TRACE REPORTING
  // =========================================================================

  /**
   * Emit a trace event for a workflow step (git-clone, HITL, etc.)
   * This makes step execution visible in the UI trace panel.
   */
  private async emitStepTrace(params: {
    taskId: string | undefined;
    stepId: string;
    stepType: string;
    stepName?: string;
    stage: 'pre' | 'post';
    status: 'started' | 'completed' | 'failed' | 'skipped';
    error?: string;
    inputData?: any;
    outputData?: any;
    executionTime?: number;
  }): Promise<void> {
    try {
      if (!this.streams) {
        this.streams = getAgentStreams();
      }
      if (!this.streams?.executionTraces || !params.taskId) return;

      const { taskId, stepId, stepType, stepName, stage, status, error, inputData, outputData, executionTime } = params;
      const id = `wf-step-${stepId}-${stage}-${Date.now()}`;

      await this.streams.executionTraces.set(taskId, id, {
        id,
        traceId: id,
        level: 'workflow-step',
        taskId,
        agentId: `workflow-step-${stepId}`,
        stage,
        status,
        error,
        inputData: inputData ? JSON.stringify(inputData) : undefined,
        outputData: outputData ? JSON.stringify(outputData) : undefined,
        executionTime,
        timestamp: new Date().toISOString(),
        metadata: {
          stepId,
          stepType,
          stepName: stepName || stepId,
          workflowStep: true,
        },
      });
    } catch (err) {
      // Don't let trace failures break step execution
      this.logger.warn('[WorkflowEngine] Failed to emit step trace', { error: (err as Error).message });
    }
  }

  /**
   * Extract repository name from URL
   * e.g. https://github.com/org/repo.git -> repo
   */
  /**
   * Detect the default branch of a git repo from its remote.
   * Falls back to 'main' if detection fails.
   */
  private async detectDefaultBranch(repoDir: string): Promise<string> {
    try {
      const { execSync: execSyncFn } = await import('child_process');
      const result = execSyncFn(
        `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null`,
        { cwd: repoDir, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
      ).toString().trim();
      const branch = result.replace(/^refs\/remotes\/origin\//, '').replace(/^origin\//, '');
      if (branch) {
        this.logger.info(`[WorkflowEngine] Detected default branch: ${branch}`);
        return branch;
      }
    } catch {
      // Detection failed
    }
    this.logger.warn('[WorkflowEngine] Could not detect default branch, falling back to main');
    return 'main';
  }

  private extractRepoName(url: string): string {
    const match = url.match(/\/([^/]+?)(\.git)?$/);
    return match ? match[1] : 'repo';
  }

  /**
   * Generate a concise git branch name from task content using LLM.
   * Falls back to a timestamp-based name if LLM fails.
   *
   * e.g. "创建一个令牌桶限速库" -> "feat/token-bucket"
   *      "Add user login page" -> "feat/user-login"
   */
  private async generateWorktreeBranch(taskContent: string): Promise<string> {
    const raw = (taskContent || '').trim().substring(0, 200);
    if (!raw) {
      return `task/${Date.now()}`;
    }

    try {
      const { LLMClientFactory } = await import('../llm/factory');
      const llm = LLMClientFactory.createForAgent({});

      const response = await llm.messagesCreate([
        {
          role: 'system',
          content: 'You generate git branch names. Output ONLY the branch name, nothing else. Format: feat/short-kebab-case. Max 40 chars total. Use English only.',
        },
        {
          role: 'user',
          content: `Generate a short git branch name for this task:\n${raw}`,
        },
      ], {}, 'worktree-branch');

      const branchName = response.content.trim().replace(/^["'`]|["'`]$/g, '');

      // Validate: must be a reasonable branch name
      if (branchName && /^[a-zA-Z0-9/._-]+$/.test(branchName) && branchName.length <= 50) {
        this.logger.info('[WorkflowEngine] LLM generated worktree branch', { taskContent: raw.substring(0, 50), branchName });
        return branchName;
      }

      this.logger.warn('[WorkflowEngine] LLM branch name invalid, using fallback', { branchName });
    } catch (error: any) {
      this.logger.warn('[WorkflowEngine] LLM branch name generation failed', { error: error.message });
    }

    // Fallback: timestamp
    return `task/${Date.now()}`;
  }

  /**
   * Inject authentication token into git URL
   * e.g. https://github.com/org/repo.git -> https://x-access-token:TOKEN@github.com/org/repo.git
   */
  private injectToken(url: string, token: string): string {
    return url.replace(/^(https?:\/\/)/, `$1x-access-token:${token}@`);
  }

  /**
   * Execute HITL (Human-In-The-Loop) step
   * Saves HITL state, polls for response, and executes action
   */
  private async executeHITLStep(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions,
    startTime: number
  ): Promise<any> {
    this.logger.info('[WorkflowEngine] Executing HITL step', {
      stepId: step.id,
      stepName: step.name,
    });

    const hitlStep = step.hitlStep!;
    const taskId = options.taskId || `workflow-${Date.now()}`;

    // Emit pre-trace
    await this.emitStepTrace({
      taskId, stepId: step.id, stepType: 'hitl', stepName: step.name,
      stage: 'pre', status: 'started',
      inputData: { question: hitlStep.question, optionsCount: hitlStep.options?.length },
    });
    // 1. Get context output from previous step (if configured)
    let contextOutput: any = null;
    if (hitlStep.context?.from_step) {
      const fromStepId = hitlStep.context.from_step;
      const fromStep = this.internalExecutionSteps.find(s => s.stepId === fromStepId);
      if (fromStep?.output) {
        contextOutput = fromStep.output;

        // If show_fields is specified, only show specific fields
        if (hitlStep.context.show_fields) {
          contextOutput = hitlStep.context.show_fields.reduce((acc, field) => {
            if (field in contextOutput) {
              acc[field] = contextOutput[field];
            }
            return acc;
          }, {} as any);
        }
      }
    }

    // 2. Save HITL state to TaskContext (reuse existing mechanism)
    const contextManager = new ContextManager();
    const existingContext = await contextManager.getContext(taskId);

    if (existingContext) {
      existingContext.hitlState = {
        stage: 'in_execution',
        status: 'awaiting',
        agentName: `Workflow:${workflow.name}`,
        question: hitlStep.question,
        options: hitlStep.options.map(opt => opt.label),  // Only store labels
        createdAt: new Date(),
        workflowName: workflow.name,
        stepId: step.id,
        retryAttempt: 0,
        // Attach additional fields for HITL Step
        ...(contextOutput && { contextOutput }),
        optionsFull: hitlStep.options,  // Store full options for internal use
      } as any;

      await contextManager.saveContext(existingContext);
    } else {
      this.logger.warn('[WorkflowEngine] No existing context found for HITL step', { taskId });
    }

    // 3. Send Stream event (reuse existing mechanism)
    const streams = getAgentStreams();
    if (streams?.taskExecution) {
      const event = {
        type: 'awaiting_clarification' as const,
        progressType: 'hitl' as const,
        status: 'awaiting_clarification' as const,
        taskId,
        sessionId: options.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          stage: 'in_execution',
          agentName: `Workflow:${workflow.name}`,
          question: hitlStep.question,
          options: hitlStep.options.map(opt => opt.label),
          context: contextOutput,  // Attach context
        }
      };

      const groupId = taskId;
      const timestamp = Date.now();
      const entryId = `workflow-hitl-${groupId}-${timestamp}`;

      await streams.taskExecution.set(groupId, entryId, {
        ...event,
        category: 'workflow_hook',
      });
    }

    // 4. Poll for decision (reuse existing HITL polling logic)
    const pollInterval = 5000;  // 5 seconds
    const timeout = 7 * 24 * 60 * 60 * 1000;  // 7 days (same as existing HITL)
    const pollingStartTime = Date.now();

    while (Date.now() - pollingStartTime < timeout) {
      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // Check status
      const updatedContext = await contextManager.getContext(taskId);
      if (!updatedContext?.hitlState) {
        continue;
      }

      const hitlState = updatedContext.hitlState;

      // Check if response is received
      if (hitlState.status === 'completed' && hitlState.response) {
        this.logger.info('[WorkflowEngine] HITL decision received', {
          stepId: step.id,
          decision: hitlState.response.content,
        });

        // Clear HITL state
        delete updatedContext.hitlState;
        await contextManager.saveContext(updatedContext);

        // Execute decision action
        return await this.executeHITLStepAction(
          step,
          context,
          workflow,
          options,
          startTime,
          hitlState.response,
          contextOutput
        );
      }
    }

    // Timeout
    this.logger.warn('[WorkflowEngine] HITL step timeout', {
      stepId: step.id,
    });

    await this.emitStepTrace({
      taskId, stepId: step.id, stepType: 'hitl', stepName: step.name,
      stage: 'post', status: 'failed', error: 'HITL timeout: no decision received',
      executionTime: Date.now() - startTime,
    });

    return {
      stepId: step.id,
      status: 'failed',
      error: 'HITL timeout: no decision received',
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Execute HITL step decision action
   */
  private async executeHITLStepAction(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions,
    startTime: number,
    response: any,
    contextOutput?: any
  ): Promise<any> {
    const hitlStep = step.hitlStep!;
    // response.content contains the label of the selected option
    const selectedOption = hitlStep.options.find(opt => opt.label === response.content);

    if (!selectedOption) {
      return {
        stepId: step.id,
        status: 'failed',
        error: `Invalid decision: ${response.content}`,
        executionTime: Date.now() - startTime,
      };
    }

    this.logger.info('[WorkflowEngine] Executing HITL action', {
      stepId: step.id,
      action: selectedOption.action,
    });

    // Execute based on action type
    switch (selectedOption.action) {
      case 'continue': {
        // Continue to next step
        // Set context variables if configured
        if (selectedOption.set_context) {
          Object.keys(selectedOption.set_context!).forEach(key => {
            context.set(`variables.${key}`, selectedOption.set_context![key]);
          });
        }

        return {
          stepId: step.id,
          status: 'completed',
          output: {
            decision: selectedOption.id,
            label: selectedOption.label,
            context: contextOutput,
            // Include user modifications if allowed
            modifiedOutput: response.modifiedOutput,
          },
          executionTime: Date.now() - startTime,
        };
      }

      case 'abort': {
        // Abort workflow
        return {
          stepId: step.id,
          status: 'failed',
          error: `Aborted by HITL: ${selectedOption.label}`,
          executionTime: Date.now() - startTime,
        };
      }

      case 'retry': {
        // Retry specified step
        const retryStepId = selectedOption.retry_step || step.id;
        this.logger.info('[WorkflowEngine] Retrying step after HITL', {
          retryStepId,
        });

        // Find the step to retry
        const retryStep = workflow.steps.find(s => s.id === retryStepId);
        if (!retryStep) {
          return {
            stepId: step.id,
            status: 'failed',
            error: `Retry step not found: ${retryStepId}`,
            executionTime: Date.now() - startTime,
          };
        }

        // Re-execute the step recursively
        const retryResult = await this.executeStep(retryStep, context, workflow, options);

        // If retry succeeded, mark current HITL step as completed
        if (retryResult.status === 'completed') {
          return {
            stepId: step.id,
            status: 'completed',
            output: {
              decision: selectedOption.id,
              label: selectedOption.label,
              retriedStep: retryStepId,
              retryResult: retryResult.output,
            },
            executionTime: Date.now() - startTime,
          };
        } else {
          return {
            stepId: step.id,
            status: 'failed',
            error: `Retry failed: ${retryResult.error}`,
            executionTime: Date.now() - startTime,
          };
        }
      }

      default: {
        return {
          stepId: step.id,
          status: 'failed',
          error: `Unknown action: ${selectedOption.action}`,
          executionTime: Date.now() - startTime,
        };
      }
    }
  }
}
