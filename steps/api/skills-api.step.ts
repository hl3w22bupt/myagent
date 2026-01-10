/**
 * Skills API Step.
 *
 * Provides endpoints to query available skills and their details.
 */
import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

/**
 * Query parameters schema for skills list API.
 */
export const querySchema = z.object({
  /**
   * Filter skills by tags.
   */
  tags: z.string().optional().describe('Comma-separated tags to filter skills'),
});

/**
 * Skills API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'skills-api',
  description: 'API endpoint for querying available skills',

  /**
   * API route configuration.
   */
  path: '/api/skills',
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
  flows: ['metadata-api']
};

/**
 * Load skill metadata from skill.yaml files.
 */
function loadSkillsMetadata(): any[] {
  const skillsDir = join(process.cwd(), 'skills');

  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: any[] = [];

  try {
    const skillFolders = readdirSync(skillsDir, { withFileTypes: true });

    for (const folder of skillFolders) {
      if (folder.isDirectory()) {
        const skillYamlPath = join(skillsDir, folder.name, 'skill.yaml');

        if (existsSync(skillYamlPath)) {
          try {
            const content = readFileSync(skillYamlPath, 'utf-8');
            const skillConfig: any = yaml.load(content);

            skills.push({
              name: skillConfig.name || folder.name,
              version: skillConfig.version || '1.0.0',
              description: skillConfig.description || '',
              tags: skillConfig.tags || [],
              type: skillConfig.type || 'unknown'
            });
          } catch (_error) {
            console.warn(`Failed to load skill.yaml for ${folder.name}:`, _error);
          }
        }
      }
    }
  } catch (_error) {
    console.error('Error reading skills directory:', _error);
  }

  return skills;
}

/**
 * Skills API handler.
 *
 * Returns list of available skills with optional tag filtering.
 */
export const handler = async (
  request: any,
  { logger }: any
) => {
  logger.info('Skills API: Received request');

  try {
    // Parse query parameters
    const queryParams: Record<string, any> = request.queryParams || {};
    const validationResult = querySchema.safeParse(queryParams);

    if (!validationResult.success) {
      throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
    }

    const { tags } = validationResult.data;

    // Load all skills metadata
    let skills = loadSkillsMetadata();

    // Filter by tags if provided
    if (tags) {
      const tagList = tags.split(',').map((t: string) => t.trim().toLowerCase());
      skills = skills.filter((skill: any) =>
        skill.tags.some((tag: string) => tagList.includes(tag.toLowerCase()))
      );
    }

    return {
      status: 200,
      body: {
        success: true,
        count: skills.length,
        skills
      }
    };

  } catch (_error: any) {
    logger.error('Skills API: Error', { _error: _error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve skills',
        _error: _error.message
      }
    };
  }
};
