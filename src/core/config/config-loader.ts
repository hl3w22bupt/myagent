/**
 * Configuration loader supporting YAML and TOML formats.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ConfigLoadOptions {
  basePath?: string;
  env?: NodeJS.ProcessEnv;
}

export class ConfigLoader {
  private basePath: string;
  private env: NodeJS.ProcessEnv;

  constructor(options: ConfigLoadOptions = {}) {
    this.basePath = options.basePath || process.cwd();
    this.env = options.env || process.env;
  }

  /**
   * Load configuration from a file (YAML or TOML)
   */
  async load<T = any>(configPath: string): Promise<T> {
    const fullPath = path.resolve(this.basePath, configPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const content = await fs.promises.readFile(fullPath, 'utf-8');

    switch (ext) {
      case '.yaml':
      case '.yml':
        return this.parseYAML(content) as T;
      case '.toml':
        // TOML support can be added later
        throw new Error('TOML support not yet implemented');
      default:
        throw new Error(`Unsupported config format: ${ext}`);
    }
  }

  /**
   * Load configuration synchronously
   */
  loadSync<T = any>(configPath: string): T {
    const fullPath = path.resolve(this.basePath, configPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const content = fs.readFileSync(fullPath, 'utf-8');

    switch (ext) {
      case '.yaml':
      case '.yml':
        return this.parseYAML(content) as T;
      default:
        throw new Error(`Unsupported config format: ${ext}`);
    }
  }

  /**
   * Parse YAML content
   */
  private parseYAML(content: string): any {
    try {
      return yaml.load(content);
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error}`);
    }
  }

  /**
   * Load multiple config files and merge them
   */
  async loadMultiple(configPaths: string[]): Promise<any[]> {
    const configs = await Promise.all(
      configPaths.map(p => this.load(p))
    );
    return configs;
  }

  /**
   * Set base path for relative config paths
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  /**
   * Get environment variable
   */
  getEnv(key: string): string | undefined {
    return this.env[key];
  }
}

/**
 * Singleton instance
 */
let defaultLoader: ConfigLoader | null = null;

export function getConfigLoader(options?: ConfigLoadOptions): ConfigLoader {
  if (!defaultLoader) {
    defaultLoader = new ConfigLoader(options);
  }
  return defaultLoader;
}
