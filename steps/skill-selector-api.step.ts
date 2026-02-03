/**
 * Skill Selector API Step.
 *
 * Python API endpoint for automatic skill selection.
 * Provides intelligent skill matching based on task description.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { spawn } from 'child_process';
import { join } from 'path';

/**
 * Request body schema for Skill Selector API.
 */
export const bodySchema = z.object({
  /**
   * Task description to analyze.
   */
  task: z.string().describe('Task description for skill selection'),
});

/**
 * Skill Selector API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'skill-selector-api',
  description: 'API endpoint for automatic skill selection',

  /**
   * API route configuration.
   */
  path: '/api/skills/select',
  method: 'POST',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['metadata-api'],
};

/**
 * Execute Python script for skill selection.
 */
function executePythonSkillSelector(task: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'select_skill.py');

    const python = spawn('python3', [scriptPath, task], {
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    python.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Skill Selector API handler.
 *
 * Analyzes task description and returns selected skill.
 */
export const handler = async (request: any, { logger }: any) => {
  // Validate request body
  const validationResult = bodySchema.safeParse(request.body);
  if (!validationResult.success) {
    throw new Error(`Invalid request: ${validationResult.error.message}`);
  }

  const { task } = validationResult.data;

  logger.info('Skill Selector API: Received task', {
    task: task.substring(0, 100),
  });

  try {
    // Call Python skill selector
    const result = await executePythonSkillSelector(task);

    logger.info('Skill selection completed', {
      task: task.substring(0, 100),
      selectedSkill: result.skill_name,
      selected: result.selected,
    });

    return {
      status: 200,
      body: {
        success: true,
        ...result,
      },
    };
  } catch (error: any) {
    logger.error('Skill selection failed', {
      error: error.message,
      task: task.substring(0, 100),
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message,
      },
    };
  }
};
