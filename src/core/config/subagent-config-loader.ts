/**
 * Subagent Configuration Loader
 *
 * Loads and validates subagent.yaml configuration files.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Subagent configuration loader
 */
export class SubagentConfigLoader {
  private configCache: Map<string, any> = new Map();

  /**
   * Load subagent configuration from agent.yaml file
   *
   * @param subagentName - Subagent name (e.g., "emotional-girlfriend-lively")
   * @returns Subagent configuration
   * @throws Error if configuration file is invalid or not found
   */
  async loadSubagentConfig(subagentName: string): Promise<any> {
    // Check cache first
    if (this.configCache.has(subagentName)) {
      return this.configCache.get(subagentName);
    }

    // Resolve path to agent.yaml
    const configPath = path.resolve(process.cwd(), 'subagents', subagentName, 'agent.yaml');

    console.log(`[SubagentConfigLoader] Loading subagent config: ${configPath}`);

    try {
      // Check if file exists
      try {
        await fs.access(configPath);
      } catch (error) {
        throw new Error(`Subagent configuration not found: ${configPath}`);
      }

      // Read YAML file
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(fileContent) as any;

      // Validate configuration
      this.validateConfig(config);

      // Cache configuration
      this.configCache.set(subagentName, config);

      console.log(`[SubagentConfigLoader] Loaded subagent config: ${config.name || subagentName}`);

      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Subagent configuration not found: ${configPath}`);
      }
      throw new Error(`Failed to load subagent configuration: ${error.message}`);
    }
  }

  /**
   * Validate subagent configuration
   *
   * @param config - Raw configuration object
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: any): void {
    // Subagent must have a name or agent.system_prompt
    if (!config.name && !config.agent?.system_prompt) {
      throw new Error('Missing required field: name or agent.system_prompt');
    }

    // Validate agent section if exists
    if (config.agent) {
      if (!config.agent.system_prompt) {
        throw new Error('Missing required field: agent.system_prompt');
      }
    }

    // Validate available_skills if exists
    if (config.available_skills && !Array.isArray(config.available_skills)) {
      throw new Error('Invalid field: available_skills (must be an array)');
    }

    // Validate agent section if exists
    if (config.agent?.available_skills && !Array.isArray(config.agent.available_skills)) {
      throw new Error('Invalid field: agent.available_skills (must be an array)');
    }
  }

  /**
   * Clear configuration cache
   *
   * @param subagentName - Optional subagent name to clear specific cache, or clear all if not provided
   */
  clearCache(subagentName?: string): void {
    if (subagentName) {
      this.configCache.delete(subagentName);
    } else {
      this.configCache.clear();
    }
  }

  /**
   * Get cached configuration (if exists)
   *
   * @param subagentName - Subagent name
   * @returns Subagent configuration or undefined if not cached
   */
  getCachedConfig(subagentName: string): any | undefined {
    return this.configCache.get(subagentName);
  }

  /**
   * List all available subagents
   *
   * @returns Array of subagent names
   */
  async listAvailableSubagents(): Promise<string[]> {
    const subagentsDir = path.resolve(process.cwd(), 'subagents');

    try {
      const entries = await fs.readdir(subagentsDir, { withFileTypes: true });
      const subagentNames: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agentYamlPath = path.join(subagentsDir, entry.name, 'agent.yaml');
          try {
            await fs.access(agentYamlPath);
            subagentNames.push(entry.name);
          } catch {
            // Skip if agent.yaml doesn't exist
          }
        }
      }

      return subagentNames.sort();
    } catch (error: any) {
      console.error(`[SubagentConfigLoader] Failed to list subagents: ${error.message}`);
      return [];
    }
  }
}

// Export singleton instance
export const subagentConfigLoader = new SubagentConfigLoader();
