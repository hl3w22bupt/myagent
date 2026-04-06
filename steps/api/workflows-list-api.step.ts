/**
 * Workflows List API Step
 *
 * Provides endpoint to list all available workflows
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { ApiRouteConfig } from 'motia';
const WORKFLOWS_DIR = join(process.cwd(), 'workflows');

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
    // Read workflow directories
    const workflowDirs = await fs.readdir(WORKFLOWS_DIR);
    const workflows = [];

    for (const dir of workflowDirs) {
      const dirPath = join(WORKFLOWS_DIR, dir);
      const stat = await fs.stat(dirPath);

      if (stat.isDirectory()) {
        try {
          const yamlPath = join(dirPath, 'workflow.yaml');
          const yamlContent = await fs.readFile(yamlPath, 'utf-8');
          const workflow = parse(yamlContent);

          const stepCount = workflow.steps?.length || 0;

          workflows.push({
            id: dir, // 使用目录名作为 ID
            name: workflow.name,
            description: workflow.description,
            input_schema: workflow.input_schema,
            output_schema: workflow.output_schema,
            step_count: stepCount,
          });

          logger.info('[WorkflowsAPI] Loaded workflow', {
            name: workflow.name,
            stepCount,
          });
        } catch (error) {
          // Skip invalid workflow directories
          logger.warn('[WorkflowsAPI] Failed to load workflow', { dir, error: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        count: workflows.length,
        workflows,
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
