/**
 * Workflow Loader
 *
 * Loads workflow configurations from YAML files
 *
 * Directory structure:
 *   workflows/
 *     simple-dev-workflow/
 *       workflow.yaml
 *     code-review-pipeline/
 *       workflow.yaml
 *
 * Each workflow.yaml contains a single workflow config (no 'workflows:' key needed)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { WorkflowEngine } from './engine.js';
import { WorkflowConfig } from './types.js';
import { ConfigLoader } from '../config/config-loader.js';
import { WorkflowValidator, AgentValidationOptions } from './validator.js';
import { discoverSubagents } from '../../index.js';

export class WorkflowLoader {
  private engine: WorkflowEngine;
  private configLoader: ConfigLoader;
  private validator: WorkflowValidator;

  constructor(engine: WorkflowEngine) {
    this.engine = engine;
    this.configLoader = new ConfigLoader({ basePath: process.cwd() });
    this.validator = new WorkflowValidator();
  }

  /**
   * Get master agent configuration availability
   */
  private hasMasterAgentConfig(): boolean {
    // Try to get the agent manager from engine
    const agentManager = (this.engine as any).agentManager;
    if (agentManager && agentManager.config) {
      return !!agentManager.config.masterAgentConfig;
    }
    return false;
  }

  /**
   * Load workflows from a directory (scans for workflow.yaml files)
   */
  async loadFromDirectory(workflowsDir: string): Promise<Record<string, WorkflowConfig>> {
    const fullPath = path.resolve(process.cwd(), workflowsDir);
    const workflows: Record<string, WorkflowConfig> = {};

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      // Discover available agents for validation
      const availableSubagents = discoverSubagents();
      const hasMasterAgent = this.hasMasterAgentConfig();

      // Update validator with agent information
      const validationOptions: AgentValidationOptions = {
        availableSubagents,
        hasMasterAgent,
      };
      this.validator = new WorkflowValidator(validationOptions);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const workflowDir = path.join(fullPath, entry.name);
        const workflowFile = path.join(workflowDir, 'workflow.yaml');

        try {
          const config = await this.configLoader.load<WorkflowConfig>(workflowFile);
          const workflowName = this.slugify(entry.name);

          // Validate with agent checking
          const errors = this.validator.validate(config);
          if (errors.length > 0) {
            console.error(`[WorkflowLoader] ✗ Workflow "${workflowName}" validation failed:`, errors);

            // Register failed workflow with detailed error message
            const errorDetails = errors.map(e => `  [${e.stepId}] ${e.field}: ${e.error}`).join('\n');
            this.engine.registerFailedWorkflow(workflowName, errorDetails);

            continue;
          }

          workflows[workflowName] = config;
          console.log(`[WorkflowLoader] ✓ Workflow "${workflowName}" loaded from ${workflowFile}`);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn(`[WorkflowLoader] Failed to load ${workflowFile}:`, error.message);
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[WorkflowLoader] Workflows directory not found: ${fullPath}`);
        return {};
      }
      throw error;
    }

    // Register workflows
    this.engine.registerWorkflows(workflows);

    console.log(`[WorkflowLoader] Loaded ${Object.keys(workflows).length} workflow(s) from ${workflowsDir}`);

    return workflows;
  }

  /**
   * Load workflows from a YAML file (legacy support)
   */
  async load(configPath: string): Promise<Record<string, WorkflowConfig>> {
    const fullPath = path.resolve(process.cwd(), configPath);
    const config = await this.configLoader.load<{ version?: string; workflows?: Record<string, WorkflowConfig> }>(fullPath);

    const workflows = config.workflows || {};

    // Discover available agents for validation
    const availableSubagents = discoverSubagents();
    const hasMasterAgent = this.hasMasterAgentConfig();

    // Update validator with agent information
    const validationOptions: AgentValidationOptions = {
      availableSubagents,
      hasMasterAgent,
    };
    this.validator = new WorkflowValidator(validationOptions);

    // Validate each workflow
    for (const [name, workflowConfig] of Object.entries(workflows)) {
      const errors = this.validator.validate(workflowConfig);

      if (errors.length > 0) {
        const errorMsg = `Workflow "${name}" validation failed:\n` +
          errors.map(e => `  [${e.stepId}] ${e.field}: ${e.error}`).join('\n');
        throw new Error(errorMsg);
      }

      console.log(`[WorkflowLoader] ✓ Workflow "${name}" validated successfully`);
    }

    // Register workflows
    this.engine.registerWorkflows(workflows);

    console.log(`[WorkflowLoader] Loaded ${Object.keys(workflows).length} workflow(s) from ${configPath}`);

    return workflows;
  }

  /**
   * Load workflows from default locations
   * Priority: workflows/ directory > config/workflows.yaml
   */
  async loadFromDefaults(): Promise<Record<string, WorkflowConfig>> {
    // Try directory-based loading first
    const dirPaths = ['workflows', 'config/workflows'];
    for (const dirPath of dirPaths) {
      try {
        const workflows = await this.loadFromDirectory(dirPath);
        if (Object.keys(workflows).length > 0) {
          return workflows;
        }
      } catch {
        // Continue to next path
      }
    }

    // Fallback to file-based loading (legacy)
    const filePaths = ['config/workflows.yaml', 'config/workflow.yaml', 'workflows.yaml'];
    for (const filePath of filePaths) {
      try {
        return await this.load(filePath);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`[WorkflowLoader] Failed to load ${filePath}:`, error.message);
        }
      }
    }

    console.log('[WorkflowLoader] No workflow config found, starting empty');
    return {};
  }

  /**
   * Convert directory name to workflow ID
   * Preserves underscores and hyphens, converts to lowercase
   */
  private slugify(name: string): string {
    return name.toLowerCase();
  }
}

/**
 * Singleton instance
 */
let loaderInstance: WorkflowLoader | null = null;

export function getWorkflowLoader(engine: WorkflowEngine): WorkflowLoader {
  if (!loaderInstance) {
    loaderInstance = new WorkflowLoader(engine);
  }
  return loaderInstance;
}
