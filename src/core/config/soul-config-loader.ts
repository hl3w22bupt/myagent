/**
 * Soul Configuration Loader
 *
 * Loads and validates soul.yaml configuration files.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { SoulConfig } from '../agent/soul-types';

/**
 * Soul configuration loader
 */
export class SoulConfigLoader {
  private configCache: Map<string, SoulConfig> = new Map();

  /**
   * Load soul configuration from soul.yaml file
   *
   * @param soulId - Soul identifier (e.g., "emotional-girlfriend-lively")
   * @returns Soul configuration
   * @throws Error if configuration file is invalid or not found
   */
  async loadSoulConfig(soulId: string): Promise<SoulConfig> {
    // Check cache first
    if (this.configCache.has(soulId)) {
      return this.configCache.get(soulId)!;
    }

    // Resolve path to soul.yaml
    const configPath = path.resolve(process.cwd(), 'autonomous', soulId, 'soul.yaml');

    console.log(`[SoulConfigLoader] Loading soul config: ${configPath}`);

    try {
      // Read YAML file
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(fileContent) as any;

      // Validate configuration
      this.validateConfig(config);

      // Create SoulConfig object
      const soulConfig: SoulConfig = {
        soul_id: config.soul_id || soulId,
        display_name: config.display_name || soulId,
        subagent: config.subagent,
        goal: config.goal,
        primitives: config.primitives || ['hibernate', 'schedule', 'complete'],
        hibernation: {
          idle_timeout: config.hibernation?.idle_timeout || 3600000 // Default: 1 hour
        }
      };

      // Cache configuration
      this.configCache.set(soulId, soulConfig);

      console.log(`[SoulConfigLoader] Loaded soul config: ${soulConfig.display_name}`);

      return soulConfig;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Soul configuration not found: ${configPath}`);
      }
      throw new Error(`Failed to load soul configuration: ${error.message}`);
    }
  }

  /**
   * Validate soul configuration
   *
   * @param config - Raw configuration object
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: any): void {
    if (!config.subagent) {
      throw new Error('Missing required field: subagent');
    }

    if (!config.goal || typeof config.goal !== 'string') {
      throw new Error('Missing or invalid field: goal');
    }

    if (config.primitives && !Array.isArray(config.primitives)) {
      throw new Error('Invalid field: primitives (must be an array)');
    }

    if (config.hibernation && config.hibernation.idle_timeout && typeof config.hibernation.idle_timeout !== 'number') {
      throw new Error('Invalid field: hibernation.idle_timeout (must be a number)');
    }
  }

  /**
   * Clear configuration cache
   *
   * @param soulId - Optional soul ID to clear specific cache, or clear all if not provided
   */
  clearCache(soulId?: string): void {
    if (soulId) {
      this.configCache.delete(soulId);
    } else {
      this.configCache.clear();
    }
  }

  /**
   * Get cached configuration (if exists)
   *
   * @param soulId - Soul identifier
   * @returns Soul configuration or undefined if not cached
   */
  getCachedConfig(soulId: string): SoulConfig | undefined {
    return this.configCache.get(soulId);
  }

  /**
   * List all available soul configurations
   *
   * @returns Array of soul IDs
   */
  async listAvailableSouls(): Promise<string[]> {
    const autonomousPath = path.resolve(process.cwd(), 'autonomous');

    try {
      const entries = await fs.readdir(autonomousPath, { withFileTypes: true });
      const soulDirs = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name);

      console.log(`[SoulConfigLoader] Found ${soulDirs.length} available souls:`, soulDirs);
      return soulDirs;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn(`[SoulConfigLoader] Autonomous directory not found: ${autonomousPath}`);
        return [];
      }
      throw error;
    }
  }
}

// Export singleton instance
export const soulConfigLoader = new SoulConfigLoader();
