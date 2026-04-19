/**
 * Workflow Detail API Step
 *
 * Provides endpoint to get detailed workflow configuration including steps
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { type StepConfig, logger } from 'motia';
const WORKFLOWS_DIR = join(process.cwd(), 'workflows');

/**
 * Workflow Detail API configuration.
 */
export const config = {
  name: 'workflow-detail-api',
  description: 'API endpoint for getting workflow details',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/workflows/:name' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Workflow detail handler.
 */
export const handler = async (context: any) => {
  const { name } = context.request?.pathParams ?? context.request?.params ?? {};
  logger.info('Workflow Detail API: Received request', { workflowName: name });

  try {
    // Find workflow directory
    const workflowDirs = await fs.readdir(WORKFLOWS_DIR);
    let workflowPath: string | null = null;

    for (const dir of workflowDirs) {
      const dirPath = join(WORKFLOWS_DIR, dir);
      const stat = await fs.stat(dirPath);

      if (stat.isDirectory()) {
        const yamlPath = join(dirPath, 'workflow.yaml');
        try {
          await fs.access(yamlPath);
          const yamlContent = await fs.readFile(yamlPath, 'utf-8');
          const workflow = parse(yamlContent);

          // Check if this is the requested workflow
          // Normalize workflow name (convert to kebab-case if needed)
          const workflowName = workflow.name || dir;
          const normalizedRequestedName = name.toLowerCase().replace(/\s+/g, '-');
          const normalizedWorkflowName = workflowName.toLowerCase().replace(/\s+/g, '-');

          if (normalizedWorkflowName === normalizedRequestedName || dir === name) {
            workflowPath = yamlPath;
            break;
          }
        } catch {
          // YAML file doesn't exist or can't be read, skip
          continue;
        }
      }
    }

    if (!workflowPath) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Workflow '${name}' not found`,
        },
      };
    }

    // Read and parse workflow YAML
    const yamlContent = await fs.readFile(workflowPath, 'utf-8');
    const workflow = parse(yamlContent);

    // Calculate step count
    const stepCount = workflow.steps?.length || 0;

    logger.info('Workflow Detail API: Workflow found', {
      workflowName: workflow.name,
      stepCount,
    });

    return {
      status: 200,
      body: {
        success: true,
        workflow: {
          name: workflow.name,
          description: workflow.description,
          steps: workflow.steps || [],
          input_schema: workflow.input_schema,
          output_schema: workflow.output_schema,
          step_count: stepCount,
          yaml: yamlContent, // 添加原始 YAML 内容
        },
      },
    };
  } catch (error: any) {
    logger.error('Workflow Detail API: Error', { error: error.message, workflowName: name });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve workflow details',
        error: error.message,
      },
    };
  }
};
