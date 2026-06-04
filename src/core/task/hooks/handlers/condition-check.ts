/**
 * Condition Check Handler
 *
 * Validates conditions using regex patterns
 */

import { HookHandler } from '../types.js';

export class ConditionCheckHandler implements HookHandler {
  async execute(context: any, config: any): Promise<any> {
    if (!config.patterns) return;

    const taskText = context.task || '';

    for (const pattern of config.patterns) {
      const regex = new RegExp(pattern.regex);
      if (regex.test(taskText)) {
        return {
          stop: pattern.stop !== false,  // default true
          reason: pattern.reason || 'Condition check failed',
        };
      }
    }

    return; // Check passed
  }
}
