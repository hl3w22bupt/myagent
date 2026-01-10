/**
 * Skill Details API Step.
 *
 * Provides endpoint to get detailed information about a specific skill.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

/**
 * Path parameters schema for skill details API.
 */
export const pathParamsSchema = z.object({
  /**
   * Skill name.
   */
  skillName: z.string().describe('Name of the skill'),
});

/**
 * Skill Details API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'skill-details-api',
  description: 'API endpoint for getting skill details',

  /**
   * API route configuration.
   */
  path: '/api/skills/:skillName',
  method: 'GET',

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
 * Skill Details API handler.
 *
 * Returns detailed information about a specific skill.
 */
export const handler = async (request: any, { logger }: any) => {
  // Extract skill name from path parameters
  const skillName = request.pathParams?.skillName;

  if (!skillName) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Skill name is required',
      },
    };
  }

  logger.info('Skill Details API: Received request', { skillName });

  try {
    const skillYamlPath = join(process.cwd(), 'skills', skillName, 'skill.yaml');

    if (!existsSync(skillYamlPath)) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Skill '${skillName}' not found`,
          availableSkills: ['web-search', 'code-analysis', 'summarize'],
        },
      };
    }

    const content = readFileSync(skillYamlPath, 'utf-8');
    const skillConfig: any = yaml.load(content);

    return {
      status: 200,
      body: {
        success: true,
        skill: {
          name: skillConfig.name || skillName,
          version: skillConfig.version || '1.0.0',
          description: skillConfig.description || '',
          tags: skillConfig.tags || [],
          type: skillConfig.type || 'unknown',
          input_schema: skillConfig.input_schema || null,
          output_schema: skillConfig.output_schema || null,
          prompt_template: skillConfig.prompt_template || null,
          execution: skillConfig.execution || null,
        },
      },
    };
  } catch (error: any) {
    logger.error('Skill Details API: Error', { error: error.message, skillName });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve skill details',
        error: error.message,
      },
    };
  }
};
