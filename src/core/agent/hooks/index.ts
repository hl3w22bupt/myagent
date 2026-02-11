/**
 * Agent Hooks System - Exports.
 *
 * Agent Hooks provide intervention points in the Agent lifecycle.
 * They operate at the Agent instance level (per session).
 */

// Base interface
export { BaseAgentHook, type AgentContext } from './base';

// Manager
export { AgentHookManager } from './manager';

// Hook implementations
export {
  AgentMonitoringHook,
  type AgentMonitoringConfig,
  type AgentHealth,
  type AgentMonitoringData,
} from './monitoring';

export {
  AgentContextSyncHook,
  type AgentContextSyncConfig,
} from './context-sync';

export {
  AgentProgressNotifyHook,
  type AgentProgressNotifyConfig,
  setAgentStreams,
  getAgentStreams,
} from './progress-notify';

export { AgentTraceHook } from './trace-hook';
