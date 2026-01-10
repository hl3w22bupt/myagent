/**
 * Sandbox Configuration Loader.
 *
 * Loads and parses Sandbox configuration from YAML files.
 */

import * as yaml from 'js-yaml';
import { readFileSync } from 'fs';

export interface LocalSandboxConfig {
  pythonPath?: string;
  timeout?: number;
  workspace?: string;
  maxSessions?: number;
}

export interface DaytonaSandboxConfig {
  apiKey?: string;
  template?: string;
}

export interface E2BSandboxConfig {
  apiKey?: string;
  template?: string;
}

export interface ModalSandboxConfig {
  token?: string;
  functionId?: string;
}

export interface SandboxAdapterConfig {
  type: string;
  local?: LocalSandboxConfig;
  daytona?: DaytonaSandboxConfig;
  e2b?: E2BSandboxConfig;
  modal?: ModalSandboxConfig;
}

export interface SandboxSystemConfig {
  default_adapter: string;
  adapters: Record<string, SandboxAdapterConfig>;
}

/**
 * Load Sandbox configuration from YAML file.
 *
 * @param configPath - Path to the configuration file
 * @returns Parsed configuration object
 */
export function loadSandboxConfig(
  configPath: string = './config/sandbox.config.yaml'
): SandboxSystemConfig {
  try {
    const fileContent = readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContent) as SandboxSystemConfig;

    // Substitute environment variables in configuration
    if (config.adapters) {
      for (const [key, adapter] of Object.entries(config.adapters)) {
        config.adapters[key] = substituteEnvVars(adapter);
      }
    }

    return config;
  } catch (error: any) {
    throw new Error(`Failed to load sandbox config from ${configPath}: ${error.message}`);
  }
}

/**
 * Substitute environment variables in configuration values.
 *
 * Supports ${VAR_NAME} syntax.
 *
 * @param value - Configuration value (can be nested object)
 * @returns Value with environment variables substituted
 */
function substituteEnvVars(value: any): any {
  if (typeof value === 'string') {
    return substituteEnvInString(value);
  }

  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }

  if (typeof value === 'object' && value !== null) {
    const result: any = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }

  return value;
}

/**
 * Substitute environment variables in a string.
 *
 * @param str - String potentially containing ${VAR_NAME}
 * @returns String with variables substituted
 */
function substituteEnvInString(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });
}

/**
 * Get configuration for a specific adapter.
 *
 * @param adapterName - Name of the adapter (e.g., 'local', 'daytona')
 * @param configPath - Optional path to config file
 * @returns Adapter configuration
 */
export function getAdapterConfig(
  adapterName: string,
  configPath?: string
): SandboxAdapterConfig | undefined {
  const config = loadSandboxConfig(configPath);
  return config.adapters[adapterName];
}

/**
 * Get default adapter configuration.
 *
 * @param configPath - Optional path to config file
 * @returns Default adapter configuration
 */
export function getDefaultAdapterConfig(configPath?: string): SandboxAdapterConfig | undefined {
  const config = loadSandboxConfig(configPath);
  const defaultName = config.default_adapter;
  return config.adapters[defaultName];
}
