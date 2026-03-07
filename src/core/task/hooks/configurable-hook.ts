/**
 * ConfigurableHook - Universal hook container driven by configuration
 *
 * Supports 4 hook types:
 * - http_webhook: Send HTTP requests
 * - condition_check: Validate conditions, can stop task
 * - middleware: Intercept and modify input/output
 * - notification: Send notifications (lark, etc.)
 */

import { BaseTaskHook } from './base';
import { ConfigurableHookConfig, HookHandler, HookTrigger, PreExecResult, TaskContext } from './types';
import { HookHandlerFactory } from './handlers/handler-factory';

export class ConfigurableHook extends BaseTaskHook {
  readonly name: string;
  private config: ConfigurableHookConfig;
  private handlers: Map<HookTrigger, HookHandler>;

  constructor(name: string, config: ConfigurableHookConfig) {
    super();
    this.name = name;
    this.config = config;
    this.handlers = new Map();
    this.initializeHandlers();
  }

  /**
   * Initialize handlers for each trigger
   */
  private initializeHandlers(): void {
    const handler = HookHandlerFactory.create(this.config);
    const triggers = Array.isArray(this.config.trigger)
      ? this.config.trigger
      : [this.config.trigger];

    for (const trigger of triggers) {
      this.handlers.set(trigger, handler);
    }
  }

  /**
   * Pre-execution hook
   */
  async preExec(context: TaskContext): Promise<PreExecResult> {
    const handler = this.handlers.get('preExec');
    if (!handler) return;
    return await handler.execute(context, this.config.config);
  }

  /**
   * Post-execution hook
   */
  async postExec(context: TaskContext, _result: any): Promise<void> {
    const handler = this.handlers.get('postExec');
    if (!handler) return;
    await handler.execute(context, this.config.config);
  }

  /**
   * Progress notification hook
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    const handler = this.handlers.get('onProgressingNotify');
    if (!handler) return;
    await handler.execute(context, this.config.config);
  }
}
