/**
 * Configurable Hook Loader
 *
 * Loads hook configurations from YAML files and registers them
 *
 * Directory structure:
 *   hooks/
 *     task/
 *       content-moderation.yaml
 *       external-approval.yaml
 *     agent/
 *       some-hook.yaml
 *     skill/
 *       some-hook.yaml
 *
 * Each hook.yaml contains a single hook config with 'type', 'trigger', 'config'
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigLoader } from '../../config/config-loader';
import { ConfigurableHook } from './configurable-hook';
import { TaskHookExecutor } from './executor';
import { ConfigurableHookConfig, HookType } from './types';

interface HooksConfig {
  version?: string;
  task_hooks?: Record<string, ConfigurableHookConfig>;
  agent_hooks?: Record<string, ConfigurableHookConfig>;
  skill_hooks?: Record<string, ConfigurableHookConfig>;
}

interface SingleHookConfig {
  version?: string;
  type: string;
  trigger: string;
  config: Record<string, any>;
  description?: string;
  enabled?: boolean;
}

export class HookConfigLoader {
  private configLoader: ConfigLoader;

  constructor() {
    this.configLoader = new ConfigLoader({
      basePath: process.cwd(),
    });
  }

  /**
   * Load and register hooks from a directory
   */
  async loadFromDirectory(hooksDir: string): Promise<void> {
    const fullPath = path.join(process.cwd(), hooksDir);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const hookTypeDir = path.join(fullPath, entry.name);

        // Load hooks based on directory name (task, agent, skill)
        if (['task', 'agent', 'skill'].includes(entry.name)) {
          await this.loadHookTypeFromDirectory(entry.name, hookTypeDir);
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[HookConfig] Hooks directory not found: ${fullPath}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Load hooks from a specific type directory (task/agent/skill)
   */
  private async loadHookTypeFromDirectory(hookType: string, dirPath: string): Promise<void> {
    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

        const hookPath = path.join(dirPath, file);
        const hookName = file.replace(/\.(yaml|yml)$/, '');

        try {
          const config = await this.configLoader.load<SingleHookConfig>(hookPath);

          // Skip if explicitly disabled
          if (config.enabled === false) {
            console.log(`[HookConfig] Skipping disabled hook: ${hookName}`);
            continue;
          }

          // Register based on type
          const hookConfig: ConfigurableHookConfig = {
            type: config.type as HookType,
            trigger: config.trigger as any,
            config: config.config,
          };

          if (hookType === 'task') {
            this.registerTaskHook(hookName, hookConfig);
          } else if (hookType === 'agent') {
            this.registerAgentHook(hookName, hookConfig);
          } else if (hookType === 'skill') {
            this.registerSkillHook(hookName, hookConfig);
          }

          console.log(`[HookConfig] ✓ Loaded ${hookType} hook: ${hookName} from ${hookPath}`);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn(`[HookConfig] Failed to load ${hookPath}:`, error.message);
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  /**
   * Load and register hooks from config file (legacy support)
   */
  async loadAndRegister(configPath: string): Promise<void> {
    const config = await this.configLoader.load<HooksConfig>(configPath);

    // Register Task Hooks
    if (config.task_hooks) {
      for (const [name, hookConfig] of Object.entries(config.task_hooks)) {
        this.registerTaskHook(name, hookConfig);
      }
    }

    // Register Agent Hooks (if we have AgentHookRegistry)
    if (config.agent_hooks) {
      for (const [name, hookConfig] of Object.entries(config.agent_hooks)) {
        this.registerAgentHook(name, hookConfig);
      }
    }

    // Register Skill Hooks (if we have SkillHookRegistry)
    if (config.skill_hooks) {
      for (const [name, hookConfig] of Object.entries(config.skill_hooks)) {
        this.registerSkillHook(name, hookConfig);
      }
    }
  }

  /**
   * Register a single task hook
   */
  private registerTaskHook(name: string, config: ConfigurableHookConfig): void {
    const hook = new ConfigurableHook(name, config);

    // Get or create global TaskHookExecutor
    if (!(globalThis as any).motiaTaskHookExecutor) {
      (globalThis as any).motiaTaskHookExecutor = new TaskHookExecutor();
    }

    const executor = (globalThis as any).motiaTaskHookExecutor as TaskHookExecutor;
    executor.registerHook(hook);

    console.log(`[HookConfig] Registered task hook: ${name} (type: ${config.type})`);
  }

  /**
   * Register a single agent hook
   */
  private registerAgentHook(name: string, config: ConfigurableHookConfig): void {
    // TODO: Register with AgentHookRegistry when available
    console.log(`[HookConfig] Registered agent hook: ${name} (type: ${config.type})`);
  }

  /**
   * Register a single skill hook
   */
  private registerSkillHook(name: string, config: ConfigurableHookConfig): void {
    // TODO: Register with SkillHookRegistry when available
    console.log(`[HookConfig] Registered skill hook: ${name} (type: ${config.type})`);
  }

  /**
   * Load hooks from default locations
   * Priority: hooks/ directory > config/custom-hooks.yaml
   */
  async loadFromDefaults(): Promise<void> {
    // Try directory-based loading first
    const dirPaths = ['hooks', 'config/hooks'];
    for (const dirPath of dirPaths) {
      try {
        await this.loadFromDirectory(dirPath);
        // Check if any hooks were loaded
        const executor = (globalThis as any).motiaTaskHookExecutor as TaskHookExecutor;
        if (executor) {
          const hooks = (executor as any).hooks || [];
          if (hooks.length > 0) {
            console.log(`[HookConfig] Loaded ${hooks.length} hook(s) from ${dirPath}`);
            return;
          }
        }
      } catch {
        // Continue to next path
      }
    }

    // Fallback to file-based loading (legacy)
    const filePaths = ['config/custom-hooks.yaml', 'config/hooks.yaml'];
    for (const filePath of filePaths) {
      const fullPath = path.join(process.cwd(), filePath);
      try {
        await this.loadAndRegister(fullPath);
        break; // Stop at first successful load
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`[HookConfig] Failed to load ${filePath}:`, error.message);
        }
      }
    }
  }
}

/**
 * Singleton instance
    }
  }
}

/**
 * Singleton instance
 */
let loaderInstance: HookConfigLoader | null = null;

export function getHookConfigLoader(): HookConfigLoader {
  if (!loaderInstance) {
    loaderInstance = new HookConfigLoader();
  }
  return loaderInstance;
}
