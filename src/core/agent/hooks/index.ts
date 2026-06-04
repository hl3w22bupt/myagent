/**
 * Agent Hooks System - Exports.
 *
 * Agent Hooks provide intervention points in the Agent lifecycle.
 * They operate at the Agent instance level (per session).
 */

// Base interface
export { BaseAgentHook, type AgentContext } from './base.js';

// Manager
export { AgentHookManager } from './manager.js';

// Hook implementations
export {
  AgentMonitoringHook,
  type AgentMonitoringConfig,
  type AgentHealth,
  type AgentMonitoringData,
} from './monitoring.js';

export {
  AgentContextSyncHook,
  type AgentContextSyncConfig,
} from './context-sync.js';

export {
  AgentProgressNotifyHook,
  type AgentProgressNotifyConfig,
  setAgentStreams,
  getAgentStreams,
} from './progress-notify.js';

export { AgentTraceHook } from './trace-hook.js';
