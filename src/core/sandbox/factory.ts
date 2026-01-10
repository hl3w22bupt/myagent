/**
 * Sandbox Factory.
 *
 * Factory for creating Sandbox adapters.
 * Supports multiple adapter types with a unified interface.
 */

import {
  SandboxAdapter,
  SandboxAdapterConfig,
  LocalSandboxConfig
} from './types';
import { LocalSandboxAdapter } from './adapters/local';

// Lazy load remote adapters (to be implemented)
// import { DaytonaSandboxAdapter } from './adapters/daytona';
// import { E2BSandboxAdapter } from './adapters/e2b';
// import { ModalSandboxAdapter } from './adapters/modal';

type AdapterFactory = (config?: any) => SandboxAdapter;

/**
 * Factory for creating Sandbox adapters.
 */
export class SandboxFactory {
  private static adapters = new Map<string, AdapterFactory>();

  /**
   * Register a Sandbox adapter type.
   *
   * @param type - Adapter type identifier
   * @param factory - Factory function that creates the adapter
   */
  static register(type: string, factory: AdapterFactory) {
    this.adapters.set(type, factory);
  }

  /**
   * Create a Sandbox adapter from configuration.
   *
   * @param config - Adapter configuration
   * @returns SandboxAdapter instance
   * @throws Error if adapter type is not registered
   */
  static create(config: SandboxAdapterConfig): SandboxAdapter {
    const factory = this.adapters.get(config.type);
    if (!factory) {
      throw new Error(
        `Unknown sandbox type: ${config.type}. ` +
        `Available types: ${Array.from(this.adapters.keys()).join(', ')}`
      );
    }

    // Get type-specific config
    const typeConfig = this.getTypeConfig(config);

    return factory(typeConfig);
  }

  /**
   * Get list of available adapter types.
   *
   * @returns Array of adapter type names
   */
  static getAvailableTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Extract type-specific configuration.
   */
  private static getTypeConfig(config: SandboxAdapterConfig): any {
    switch (config.type) {
      case 'local':
        return config.local || {};
      case 'daytona':
        return config.daytona || {};
      case 'e2b':
        return config.e2b || {};
      case 'modal':
        return config.modal || {};
      default:
        return {};
    }
  }
}

// Register built-in adapters
SandboxFactory.register('local', (config: LocalSandboxConfig = {}) => {
  return new LocalSandboxAdapter(config);
});

// Remote adapters (to be implemented in future phases)
// SandboxFactory.register('daytona', (config: DaytonaSandboxConfig) => {
//   return new DaytonaSandboxAdapter(config);
// });

// SandboxFactory.register('e2b', (config: E2BSandboxConfig) => {
//   return new E2BSandboxAdapter(config);
// });

// SandboxFactory.register('modal', (config: ModalSandboxConfig) => {
//   return new ModalSandboxAdapter(config);
// });
