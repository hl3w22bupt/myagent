/**
 * Subagents API Step.
 *
 * Provides endpoint to query available subagents.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Subagents API Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'subagents-api',
  description: 'API endpoint for querying available subagents',

  /**
   * API route configuration.
   */
  path: '/api/agents',
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
 * Default subagents defined in master-agent.ts
 *
 * These are the specialized subagents that can be delegated to:
 * - code-reviewer: Code review and analysis
 * - data-analyst: Data processing and visualization
 * - security-auditor: Security scanning and auditing
 */
const DEFAULT_SUBAGENTS = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Specialized agent for code review and quality analysis',
    type: 'subagent',
    status: 'active',
    availableSkills: ['code-analysis', 'read-file', 'git-diff'],
    systemPrompt: 'You are a code review expert with deep knowledge of software quality, design patterns, and best practices.'
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Specialized agent for data analysis and visualization',
    type: 'subagent',
    status: 'active',
    availableSkills: ['data-processing', 'visualization'],
    systemPrompt: 'You are a data analysis expert with strong skills in statistical analysis, data visualization, and insight generation.'
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Specialized agent for security auditing and vulnerability assessment',
    type: 'subagent',
    status: 'active',
    availableSkills: ['security-scan', 'dependency-check'],
    systemPrompt: 'You are a security expert with deep knowledge of vulnerabilities, threats, and security best practices.'
  }
];

/**
 * Subagents API handler.
 *
 * Returns list of available subagents in the system.
 */
export const handler = async (
  request: any,
  { logger }: any
) => {
  logger.info('Subagents API: Received request');

  try {
    return {
      status: 200,
      body: {
        success: true,
        count: DEFAULT_SUBAGENTS.length,
        agents: DEFAULT_SUBAGENTS,
        note: 'These are default subagents that can be used by the MasterAgent for task delegation'
      }
    };

  } catch (error: any) {
    logger.error('Subagents API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve subagents',
        error: error.message
      }
    };
  }
};
