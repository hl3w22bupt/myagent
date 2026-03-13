/**
 * Skill Details API Step.
 *
 * Provides endpoint to get detailed information about a specific skill.
 * Supports native skills, Claude Skills, and OpenClaw Skills.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { loadAllSkills } from '../../src/core/skill/skill-loader';

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
 * Supports native skills, Claude Skills, and OpenClaw Skills.
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
    // Load all skills using unified skill-loader
    const allSkills = loadAllSkills();

    // Find the skill by name
    const skill = allSkills.find((s) => s.name === skillName);

    if (!skill) {
      return {
        status: 404,
        body: {
          success: false,
          message: `Skill '${skillName}' not found`,
          availableSkills: allSkills.map((s) => s.name),
        },
      };
    }

    // Return the skill details
    return {
      status: 200,
      body: {
        success: true,
        data: skill,
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
