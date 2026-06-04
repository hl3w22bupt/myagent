/**
 * HTTP Webhook Handler
 *
 * Sends HTTP requests to external services
 */

import { HookHandler } from '../types.js';
import { TemplateEngine } from '../../../config/template-engine.js';

export class HttpWebhookHandler implements HookHandler {
  private cache = new Map<string, { value: any; expireTime: number }>();

  async execute(context: any, config: any): Promise<any> {
    const template = new TemplateEngine(context);
    const rendered = template.render(config);

    const response = await fetch(rendered.url, {
      method: rendered.method || 'POST',
      headers: rendered.headers || {},
      body: rendered.body ? JSON.stringify(rendered.body) : undefined,
    });

    const result = await response.json().catch(() => ({}));

    // If configured, check response and decide whether to stop
    if (config.stop_on_response) {
      const shouldStop = this.evaluateCondition(config.stop_on_response, result);
      if (shouldStop) {
        const reason = this.extractValue(result, config.stop_reason) || 'Webhook check failed';
        return { stop: true, reason };
      }
    }

    return result;
  }

  private evaluateCondition(condition: any, data: any): boolean {
    const actualValue = this.extractValue(data, condition.field);
    const expectedValue = condition.value;

    switch (condition.operator) {
      case '==': return actualValue == expectedValue;
      case '!=': return actualValue != expectedValue;
      case '>': return actualValue > expectedValue;
      case '<': return actualValue < expectedValue;
      case '>=': return actualValue >= expectedValue;
      case '<=': return actualValue <= expectedValue;
      case 'in': return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      default: return false;
    }
  }

  private extractValue(obj: any, path: string): any {
    if (!path) return obj;
    if (path.startsWith('$.')) {
      return path.substring(2).split('.').reduce((o, k) => o?.[k], obj);
    }
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}
