/**
 * Notification Handler
 *
 * Sends notifications to various channels (lark, dingtalk, slack, etc.)
 */

import { HookHandler } from '../types.js';
import { TemplateEngine } from '../../../config/template-engine.js';
import { LarkNotificationChannel } from './channels/lark.js';

export interface NotificationChannel {
  send(params: { webhook: string; message: string; config?: any }): Promise<void>;
}

export class NotificationHandler implements HookHandler {
  private channels = new Map<string, NotificationChannel>();

  constructor() {
    // Register Lark channel
    this.channels.set('lark', new LarkNotificationChannel());
    // Future: this.channels.set('dingtalk', new DingTalkNotificationChannel());
    // Future: this.channels.set('slack', new SlackNotificationChannel());
  }

  async execute(context: any, config: any): Promise<void> {
    const channelName = config.channel || 'lark';
    const channel = this.channels.get(channelName);

    if (!channel) {
      throw new Error(`Unknown notification channel: ${channelName}`);
    }

    // Check send conditions
    if (config.send_when) {
      const shouldSend = this.checkConditions(config.send_when, context);
      if (!shouldSend) return;
    }

    // Render message template
    const message = new TemplateEngine(context).renderString(config.message_template);

    // Send notification
    await channel.send({
      webhook: config.webhook,
      message,
      config,
    });
  }

  private checkConditions(conditions: any[], context: any): boolean {
    for (const cond of conditions) {
      const value = this.extractByPath(context, cond.field);
      const match = this.compare(value, cond.operator, cond.value);
      if (!match) return false;
    }
    return true;
  }

  private compare(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '==': return actual == expected;
      case '!=': return actual != expected;
      case '>': return actual > expected;
      case '<': return actual < expected;
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
      default: return false;
    }
  }

  private extractByPath(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}
