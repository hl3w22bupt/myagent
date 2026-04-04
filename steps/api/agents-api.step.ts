/**
 * Subagents API Step.
 *
 * Provides endpoint to query available subagents.
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

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
  flows: ['metadata-api'],
};

/**
 * Cache configuration.
 */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_FILE = join(process.cwd(), '.cache', 'subagents-cache.json');

/**
 * In-memory cache structure.
 */
interface SubagentCache {
  data: any[];
  timestamp: number;
}

/**
 * Load cache from file system.
 */
function loadCacheFromFile(): SubagentCache | null {
  try {
    if (existsSync(CACHE_FILE)) {
      const content = readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content) as SubagentCache;
    }
  } catch (error: any) {
    console.warn('[Subagents API] Failed to load cache from file:', error.message);
  }
  return null;
}

/**
 * Save cache to file system.
 */
function saveCacheToFile(cache: SubagentCache): void {
  try {
    const cacheDir = join(process.cwd(), '.cache');
    if (!existsSync(cacheDir)) {
      // Create cache directory if it doesn't exist
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error: any) {
    console.warn('[Subagents API] Failed to save cache to file:', error.message);
  }
}

/**
 * Load subagent metadata from agent.yaml files.
 *
 * Scans the /subagents directory and loads metadata from each agent.yaml file.
 * Similar to how skills are dynamically discovered.
 */
function loadSubagentsMetadata(): any[] {
  const subagentsDir = join(process.cwd(), 'subagents');

  if (!existsSync(subagentsDir)) {
    console.warn(`[Subagents API] Subagents directory not found: ${subagentsDir}`);
    return [];
  }

  const subagents: any[] = [];

  try {
    const subagentFolders = readdirSync(subagentsDir, { withFileTypes: true });

    for (const folder of subagentFolders) {
      if (folder.isDirectory()) {
        const agentYamlPath = join(subagentsDir, folder.name, 'agent.yaml');

        if (existsSync(agentYamlPath)) {
          try {
            const content = readFileSync(agentYamlPath, 'utf-8');
            const agentConfig: any = yaml.load(content);

            // Extract metadata from agent.yaml
            const agentData: any = {
              id: folder.name,
              name: folder.name,  // ⭐ Use folder name (developer-engineer) instead of config.name
              displayName: agentConfig.name || folder.name,  // Keep config name for reference
              description: agentConfig.description || '',
              type: 'subagent',
              status: 'active',
            };

            // Extract available_skills from agent section
            if (agentConfig.agent && agentConfig.agent.available_skills) {
              agentData.availableSkills = agentConfig.agent.available_skills;
            }

            // Extract system_prompt if available
            if (agentConfig.agent && agentConfig.agent.system_prompt) {
              agentData.systemPrompt = agentConfig.agent.system_prompt;
            }

            // Extract constraints if available
            if (agentConfig.agent && agentConfig.agent.constraints) {
              agentData.constraints = agentConfig.agent.constraints;
            }

            // Extract validation config if available
            if (agentConfig.agent && agentConfig.agent.validation) {
              agentData.validation = agentConfig.agent.validation;
            }

            subagents.push(agentData);
            console.log(`[Subagents API] Loaded subagent: ${agentData.name}`);
          } catch (error: any) {
            console.warn(`[Subagents API] Failed to load agent.yaml for ${folder.name}:`, error.message);
          }
        } else {
          console.warn(`[Subagents API] No agent.yaml found in ${folder.name}`);
        }
      }
    }

    console.log(`[Subagents API] Discovered ${subagents.length} subagents`);
  } catch (error: any) {
    console.error('[Subagents API] Error reading subagents directory:', error);
  }

  return subagents;
}

/**
 * Get subagents metadata with caching.
 *
 * Returns cached data if available and fresh, otherwise loads fresh data.
 * Uses file system cache for persistence across module reloads.
 */
function getSubagentsMetadata(): any[] {
  const now = Date.now();

  // Try to load from file cache
  const fileCache = loadCacheFromFile();

  // Check if cache exists and is still valid
  if (fileCache && (now - fileCache.timestamp) < CACHE_TTL) {
    const cacheAge = Math.floor((now - fileCache.timestamp) / 1000);
    console.log(`[Subagents API] Using cached data (age: ${cacheAge}s, TTL: ${CACHE_TTL / 1000}s)`);
    return fileCache.data;
  }

  // Cache miss or expired, load fresh data
  if (fileCache) {
    const cacheAge = Math.floor((now - fileCache.timestamp) / 1000);
    console.log(`[Subagents API] Cache expired (age: ${cacheAge}s), loading fresh data...`);
  } else {
    console.log('[Subagents API] Cache miss, loading fresh data...');
  }

  const freshData = loadSubagentsMetadata();

  // Update cache
  const newCache: SubagentCache = {
    data: freshData,
    timestamp: now,
  };
  saveCacheToFile(newCache);

  console.log('[Subagents API] Cache updated and saved to file');
  return freshData;
}

/**
 * Clear the subagents cache.
 *
 * Can be called externally if manual cache invalidation is needed.
 */
export function clearSubagentsCache(): void {
  try {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
      console.log('[Subagents API] Cache file deleted');
    }
  } catch (error: any) {
    console.warn('[Subagents API] Failed to delete cache file:', error.message);
  }
}

/**
 * Subagents API handler.
 *
 * Returns list of available subagents in the system.
 * Dynamically discovers subagents from /subagents directory with 5-minute caching.
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Subagents API: Received request');

  try {
    // Check if we're using cached data before calling getSubagentsMetadata
    const now = Date.now();
    const fileCache = loadCacheFromFile();
    const isUsingCached = fileCache && (now - fileCache.timestamp) < CACHE_TTL;

    // Get subagents metadata with caching
    const subagents = getSubagentsMetadata();

    return {
      status: 200,
      body: {
        success: true,
        count: subagents.length,
        agents: subagents,
        cached: isUsingCached,
        cacheAge: isUsingCached ? Math.floor((now - fileCache!.timestamp) / 1000) : null,
        note: 'Subagents are dynamically discovered from the /subagents directory (cached for 5 minutes)',
      },
    };
  } catch (error: any) {
    logger.error('Subagents API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve subagents',
        error: error.message,
      },
    };
  }
};
void _z; // Mark as unused
