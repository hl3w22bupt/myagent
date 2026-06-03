/**
 * AgentHookManager - Manages Agent lifecycle hooks.
 *
 * Provides registration and execution of hooks during Agent lifecycle events:
 * - Agent creation/acquisition
 * - Task execution (before/after)
 * - Status checks
 * - Agent destruction
 *
 * Features:
 * - Hook registration/unregistration
 * - Sequential execution (hooks run in registration order)
 * - Error isolation (one hook failing doesn't stop others)
 * - Result aggregation (last non-undefined result is returned)
 *
 * Example:
 * ```typescript
 * const hookManager = new AgentHookManager();
 * hookManager.register(new AgentMonitoringHook());
 * hookManager.register(new AgentContextSyncHook());
 *
 * // Execute hooks
 * const result = await hookManager.executeHook('onAgentCreate', config, sessionId);
 * if (result?.abort) {
 *   console.log('Agent creation aborted:', result.reason);
 * }
 * ```
 */

import { BaseAgentHook } from './base.js';

/**
 * Manages Agent lifecycle hooks.
 *
 * Thread-safe (for single-threaded Node.js environment).
 * Hooks are executed synchronously in the order they were registered.
 */
export class AgentHookManager {
  /** Registered hooks */
  private hooks: BaseAgentHook[] = [];

  /**
   * Register a hook.
   *
   * Hooks are executed in the order they are registered.
   * The same hook instance cannot be registered twice.
   *
   * @param hook - Hook instance to register
   * @throws Error if hook is already registered
   */
  register(hook: BaseAgentHook): void {
    if (this.hooks.includes(hook)) {
      throw new Error('Hook is already registered');
    }
    this.hooks.push(hook);
  }

  /**
   * Unregister a hook.
   *
   * @param hook - Hook instance to unregister
   * @returns true if hook was found and removed, false otherwise
   */
  unregister(hook: BaseAgentHook): boolean {
    const index = this.hooks.indexOf(hook);
    if (index > -1) {
      this.hooks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Execute all hooks' specified method.
   *
   * Features:
   * - Sequential execution (in registration order)
   * - Error isolation (errors are logged, don't stop execution)
   * - Result aggregation (last non-undefined result is returned)
   *
   * @param methodName - Name of the hook method to execute
   * @param args - Arguments to pass to the hook method
   * @returns Last non-undefined result from any hook, or undefined
   *
   * @example
   * ```typescript
   * const result = await hookManager.executeHook(
   *   'onAgentCreate',
   *   config,
   *   sessionId
   * );
   * if (result?.abort) {
   *   console.log('Aborted:', result.reason);
   * }
   * ```
   */
  async executeHook<T>(
    methodName: keyof BaseAgentHook,
    ...args: any[]
  ): Promise<T | undefined> {
    let result: T | undefined;

    for (const hook of this.hooks) {
      try {
        const method = hook[methodName] as any;
        if (typeof method === 'function') {
          const hookResult = await method.apply(hook, args);
          // Aggregate result (last non-undefined result wins)
          if (hookResult !== undefined) {
            result = hookResult as T;
          }
        }
      } catch (error) {
        // Log error but continue executing other hooks
        console.error(`Agent hook ${methodName} failed:`, error);
      }
    }

    return result;
  }

  /**
   * Get all registered hooks.
   *
   * Returns a shallow copy to prevent external modification.
   *
   * @returns Array of registered hooks
   */
  getHooks(): BaseAgentHook[] {
    return [...this.hooks];
  }

  /**
   * Get number of registered hooks.
   *
   * @returns Hook count
   */
  getHookCount(): number {
    return this.hooks.length;
  }

  /**
   * Clear all registered hooks.
   *
   * Useful for testing or cleanup.
   */
  clear(): void {
    this.hooks = [];
  }
}
