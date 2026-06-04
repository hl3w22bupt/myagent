/**
 * Hook Handler Factory
 *
 * Creates appropriate handler based on hook type
 */

import { HookHandler } from '../types.js';
import { HttpWebhookHandler } from './http-webhook.js';
import { ConditionCheckHandler } from './condition-check.js';
import { MiddlewareHandler } from './middleware.js';
import { NotificationHandler } from './notification.js';

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
