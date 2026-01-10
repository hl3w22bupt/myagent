/**
 * Sandbox module exports.
 *
 * This module provides sandbox execution capabilities for the agent system.
 * It supports multiple sandbox adapters (local, Daytona, E2B, Modal) with a
 * unified interface.
 */

// Types
export type {
  SandboxOptions,
  SandboxResult,
  SandboxError,
  SandboxInfo,
  SandboxAdapterConfig,
  LocalSandboxConfig,
  DaytonaSandboxConfig,
  E2BSandboxConfig,
  ModalSandboxConfig,
  SandboxConfig,
  SandboxAdapter
} from './types';

// Manager
export { SandboxManager, SandboxManagerConfig } from './manager';

// Factory
export { SandboxFactory } from './factory';

// Config
export {
  loadSandboxConfig,
  getAdapterConfig,
  getDefaultAdapterConfig,
  type SandboxSystemConfig
} from './config';

// Adapters
export { LocalSandboxAdapter } from './adapters/local';
