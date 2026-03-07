/**
 * Hook Handler Factory
 *
 * Creates appropriate handler based on hook type
 */

import { HookHandler } from '../types';
import { HttpWebhookHandler } from './http-webhook';
import { ConditionCheckHandler } from './condition-check';
import { MiddlewareHandler } from './middleware';
import { NotificationHandler } from './notification';

export class HookHandlerFactory {
  static create(config: { type: string }): HookHandler {
    switch (config.type) {
      case 'http_webhook':
        return new HttpWebhookHandler();
      case 'condition_check':
        return new ConditionCheckHandler();
      case 'middleware':
        return new MiddlewareHandler();
      case 'notification':
        return new NotificationHandler();
      default:
        throw new Error(`Unknown hook type: ${config.type}`);
    }
  }
}
