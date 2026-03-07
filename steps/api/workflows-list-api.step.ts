/**
 * Workflows List API Step
 *
 * Provides endpoint to list all available workflows
 */

import { getAgentManager } from '../../src/index';
import { WorkflowEngine } from '../../src/core/workflow/engine';
import { getWorkflowLoader } from '../../src/core/workflow/loader';
import { ApiRouteConfig } from 'motia';

let workflowEngine: WorkflowEngine | null = null;

/**
 * Workflows API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'workflows-list-api',
  description: 'API endpoint for listing available workflows',

  path: '/api/workflows',
  method: 'GET',

  emits: [],
  virtualSubscribes: [],
  flows: [],
};

/**
 * Workflows list handler.
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Workflows API: Received request');

  try {
    // Initialize Workflow Engine if needed
    if (!workflowEngine) {
      const agentManager = getAgentManager();
      workflowEngine = new WorkflowEngine(agentManager);

      // Load workflows from config
      const workflowLoader = getWorkflowLoader(workflowEngine);
      await workflowLoader.loadFromDefaults();

      logger.info('[WorkflowsAPI] Workflow engine initialized');
    }

    const workflows = workflowEngine.listWorkflows();

    return {
      status: 200,
      body: {
        success: true,
        count: workflows.length,
        workflows: workflows.map(w => ({
          name: w.name,
          description: w.config.description,
          input_schema: w.config.input_schema,
          output_schema: w.config.output_schema,
        })),
      },
    };
  } catch (error: any) {
    logger.error('Workflows API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve workflows',
        error: error.message,
      },
    };
  }
};
