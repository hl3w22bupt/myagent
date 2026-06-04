/**
 * Skills API Step.
 *
 * Provides endpoints to query available skills and their details.
 *
 * Uses unified skill-loader from core/skill layer for consistent discovery.
 */
import { z } from 'zod';
import { type StepConfig, logger } from '../../src/iii-bridge.js';
import {
  loadAllSkills,
  filterByTags,
  filterBySource,
  UnifiedSkillMetadata
} from '../../src/core/skill/skill-loader.js';

/**
 * Query parameters schema for skills list API.
 */
export const querySchema = z.object({
  /**
   * Filter skills by tags.
   */
  tags: z.string().optional().describe('Comma-separated tags to filter skills'),

  /**
   * Filter skills by source (native, claude, or openclaw).
   */
  source: z.enum(['native', 'claude', 'openclaw']).optional().describe('Filter by skill source'),
});

/**
 * Skills API Step configuration.
 */
export const config = {
  name: 'skills-api',
  description: 'API endpoint for querying available skills',

  /**
   * API route configuration.
   */
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/skills' }],

  /**
   * No events emitted.
   */
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Skills API handler.
 *
 * Returns list of available skills with optional tag filtering.
 * Uses unified skill-loader from core/skill layer.
 */
export const handler: any = async (context: any) => {
  logger.info('Skills API: Received request');

  try {
    // Parse query parameters
    const queryParams: Record<string, any> = context.request.queryParams || {};
    const validationResult = querySchema.safeParse(queryParams);

    if (!validationResult.success) {
      throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
    }

    const { tags, source } = validationResult.data as any;

    // Load all skills using unified skill-loader
    let skills: UnifiedSkillMetadata[] = loadAllSkills();

    // Filter by source if provided (native or claude)
    if (source) {
      skills = filterBySource(skills, source);
    }

    // Filter by tags if provided
    if (tags) {
      skills = filterByTags(skills, tags);
    }

    // Count by source
    const nativeCount = skills.filter((s) => s.source === 'native').length;
    const claudeCount = skills.filter((s) => s.source === 'claude').length;
    const openclawCount = skills.filter((s) => s.source === 'openclaw').length;

    return {
      status: 200,
      body: {
        success: true,
        count: skills.length,
        nativeCount,
        claudeCount,
        openclawCount,
        skills,
      },
    };
  } catch (error: any) {
    logger.error('Skills API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve skills',
        error: error.message,
      },
    };
  }
};
