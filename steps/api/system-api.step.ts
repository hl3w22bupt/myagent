/**
 * System API Step.
 *
 * Provides endpoint to get system overview and statistics.
 *
 * Uses safe state operations to prevent wrapObject stack overflow.
 */

import { z as _z } from 'zod';
import { type StepConfig, logger } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';
import type { Task } from '../../src/core/database/data-store';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

/**
 * System API Step configuration.
 */
export const config = {
  name: 'system-api',
  description: 'API endpoint for system overview',

  /**
   * API route configuration.
   */
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/system' }],

  /**
   * No events emitted.
   */
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Load skills metadata.
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
              type: skillConfig.type || 'unknown',
            });
          } catch {
            // Skip invalid skills
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return skills;
}

/**
 * Load default subagents metadata.
 */
function loadSubagentsMetadata(): any[] {
  // Return default subagent definitions
  // These should match the subagents defined in master-agent.ts
  return [
    {
      id: 'code-reviewer',
      name: 'Code Reviewer',
      description: 'Specialized agent for code review',
      type: 'subagent',
      status: 'active',
      availableSkills: ['code-analysis', 'read-file', 'git-diff'],
    },
    {
      id: 'data-analyst',
      name: 'Data Analyst',
      description: 'Specialized agent for data analysis',
      type: 'subagent',
      status: 'active',
      availableSkills: ['data-processing', 'visualization'],
    },
    {
      id: 'security-auditor',
      name: 'Security Auditor',
      description: 'Specialized agent for security auditing',
      type: 'subagent',
      status: 'active',
      availableSkills: ['security-scan', 'dependency-check'],
    },
  ];
}

/**
 * System API handler.
 *
 * Returns system overview including skills, agents, and statistics.
 */
export const handler: any = async (context: any) => {
  logger.info('System API: Received request');

  try {
    // Load skills and subagents
    const skills = loadSkillsMetadata();
    const agents = loadSubagentsMetadata();

    // Get execution statistics from database
    let totalTasks = 0;
    let successfulTasks = 0;
    let failedTasks = 0;
    let activeSessions = 0;

    try {
      const unifiedStore = getDataStore();
      const result = await unifiedStore.listTasks({ limit: 10000 });
      const tasks = result.tasks;

      totalTasks = tasks.length;
      successfulTasks = tasks.filter((t: Task) => t.status === 'completed').length;
      failedTasks = tasks.filter((t: Task) => t.status === 'failed').length;

      // Count unique sessions
      const sessions = new Set(tasks.map((t: Task) => t.sessionId).filter(Boolean));
      activeSessions = sessions.size;
    } catch (error: any) {
      logger.error('System API: Error reading from database', { error: error.message });
      // Use defaults if database is not available
    }

    // Read package.json for version
    let version = '1.0.0';
    try {
      const packagePath = join(process.cwd(), 'package.json');
      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
        version = packageJson.version || version;
      }
    } catch {
      // Use default version
    }

    return {
      status: 200,
      body: {
        success: true,
        system: {
          name: 'Motia Agent Dashboard',
          version,
          uptime: process.uptime(),
        },
        stats: {
          totalSkills: skills.length,
          totalAgents: agents.length,
          totalTasks,
          successfulTasks,
          failedTasks,
          activeSessions,
        },
        skills,
        agents,
      },
    };
  } catch (error: any) {
    logger.error('System API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve system information',
        error: error.message,
      },
    };
  }
};
void _z; // Mark as unused
