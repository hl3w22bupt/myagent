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

export class WorkflowEngine {
  private agentManager: AgentManager;
  private workflows: Map<string, WorkflowConfig>;
  private streams: any = null;
  private logger: any;

  constructor(agentManager: AgentManager, logger: any = console) {
    this.agentManager = agentManager;
    this.workflows = new Map();
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
   * List all registered workflows
   */
  listWorkflows(): Array<{ name: string; config: WorkflowConfig }> {
    return Array.from(this.workflows.entries()).map(([name, config]) => ({ name, config }));
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

    const executionSteps: any[] = [];
    let lastCompletedStepResult: any = null;  // Track the last completed step result

    try {
      // Execute steps in dependency order
      const sortedSteps = this.topologicalSort(workflow.steps);

      for (const step of sortedSteps) {
        const stepResult = await this.executeStep(step, context, workflow, options);
        executionSteps.push(stepResult);

        // Track the last successfully completed step result
        // This will be used as the workflow's final output (like single agent)
        if (stepResult.status === 'completed') {
          lastCompletedStepResult = stepResult;
        }

        if (stepResult.status === 'failed' && !step.always_run) {
          break; // Stop on failure
        }
      }

      // Use the last completed step's agent output as the workflow output
      // Priority: structuredOutput > output (fallback to text output)
      // This aligns with single agent behavior and provides structured data to frontend
      const lastAgentResult = lastCompletedStepResult?.output;
      const finalOutput = lastAgentResult?.structuredOutput || lastAgentResult?.output || null;

      this.logger.debug('[WorkflowEngine] Workflow execution completed', {
        workflowName: workflow.name,
        success: true,
        finalOutputType: lastAgentResult?.structuredOutput ? 'structured' : (lastAgentResult?.output ? 'text' : 'none'),
        hasOutput: !!finalOutput,
        hasStructuredOutput: !!lastAgentResult?.structuredOutput,
        lastCompletedStep: lastCompletedStepResult?.stepId,
        variables: context.getVariables(),
      });

      return {
        success: true,
        output: finalOutput,
        executionTime: Date.now() - startTime,
        steps: executionSteps,
        context: context.toJSON(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        steps: executionSteps,
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
      const taskDescription = this.formatTaskDescription(step.name || step.id, renderedInput, context);

      // Create a unique sessionId for each workflow step
      // This ensures each step has its own agent instance for proper trace aggregation
      const sessionId = `workflow-${workflow.name}-${step.id}-${options.taskId || Date.now()}`;

      // Acquire the subagent directly (not through MasterAgent)
      const agent = await this.agentManager.acquire(sessionId, {
        agentType: step.agent as 'agent' | 'master',
      });

      // Set agent name for trace display (e.g., "developer-engineer")
      (agent as any).agentName = step.agent;

      // Set agent streams for progress notifications
      if (!this.streams) {
        this.streams = getAgentStreams();
      }
      setAgentStreams(this.streams);

      // Get hook manager
      const hookManager = this.agentManager.getHookManager();

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

      // Run the agent directly
      const result = await agent.run(taskDescription, options.taskId, {
        ...options,
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

      context.setStepStatus(step.id, 'completed');

      return {
        stepId: step.id,
        status: 'completed',
        output: result,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      context.setStepStatus(step.id, 'failed');
      return {
        stepId: step.id,
        status: 'failed',
        error: error.message,
        executionTime: Date.now() - startTime,
      };
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
    if (path === 'structuredOutput') {
      return result.structuredOutput !== undefined ? result.structuredOutput : defaultValue;
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
   */
  private formatTaskDescription(stepName: string, renderedInput: Record<string, any>, _context: WorkflowContext): string {
    const parts: string[] = [stepName];

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
}
