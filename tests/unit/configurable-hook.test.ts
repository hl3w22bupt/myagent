/**
 * Configurable Hook Tests
 */

import { describe, it, expect } from '@jest/globals';
import { TemplateEngine } from '../../src/core/config/template-engine';
import {
  HttpWebhookHandler,
  ConditionCheckHandler,
  MiddlewareHandler,
  NotificationHandler,
} from '../../src/core/task/hooks/handlers';

describe('TemplateEngine', () => {
  it('should render string templates', () => {
    const context = {
      task: 'Hello world',
      status: 'running',
      metadata: { userId: '123' },
    };
    const engine = new TemplateEngine(context);

    expect(engine.renderString('{{ task }}')).toBe('Hello world');
    expect(engine.renderString('{{ status }}')).toBe('running');
    expect(engine.renderString('{{ metadata.userId }}')).toBe('123');
  });

  it('should render nested paths', () => {
    const context = {
      user: { name: 'John', age: 30 },
    };
    const engine = new TemplateEngine(context);

    expect(engine.renderString('{{ user.name }}')).toBe('John');
    // renderString preserves types for single template variables
    expect(engine.renderString('{{ user.age }}')).toBe(30);
  });

  it('should render env variables', () => {
    process.env.TEST_VAR = 'test_value';
    const engine = new TemplateEngine({});

    expect(engine.renderString('{{ env.TEST_VAR }}')).toBe('test_value');
    delete process.env.TEST_VAR;
  });

  it('should render objects', () => {
    const context = {
      user: { name: 'John' },
    };
    const engine = new TemplateEngine(context);

    const result = engine.render({
      greeting: 'Hello {{ user.name }}',
      count: 5,
    });

    expect(result.greeting).toBe('Hello John');
    expect(result.count).toBe(5);
  });
});

describe('HttpWebhookHandler', () => {
  it('should send HTTP request', async () => {
    const handler = new HttpWebhookHandler();
    const mockFetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    });

    global.fetch = mockFetch;

    const context = {
      task: 'Test task',
    };

    const config = {
      url: 'http://example.com/api/test',
      method: 'POST',
      body: {
        task: '{{ task }}',
      },
    };

    await handler.execute(context, config);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com/api/test',
      expect.objectContaining({
        method: 'POST',
        body: '{"task":"Test task"}',
      })
    );
  });

  it('should stop based on response', async () => {
    const handler = new HttpWebhookHandler();
    const mockFetch = jest.fn().mockResolvedValue({
      json: async () => ({ approved: false, reason: 'Not allowed' }),
    });

    global.fetch = mockFetch;

    const context = { task: 'Test task' };

    const config = {
      url: 'http://example.com/api/check',
      stop_on_response: {
        field: '$.approved',
        operator: '==',
        value: false,
      },
      stop_reason: '$.reason',
    };

    const result = await handler.execute(context, config);

    expect(result).toEqual({
      stop: true,
      reason: 'Not allowed',
    });
  });
});

describe('ConditionCheckHandler', () => {
  it('should stop when pattern matches', async () => {
    const handler = new ConditionCheckHandler();
    const context = { task: '<script>alert("xss")</script>' };

    const config = {
      patterns: [
        {
          regex: '<script[^>]*>.*?</script>',
          stop: true,
          reason: 'XSS detected',
        },
      ],
    };

    const result = await handler.execute(context, config);

    expect(result).toEqual({
      stop: true,
      reason: 'XSS detected',
    });
  });

  it('should pass when no pattern matches', async () => {
    const handler = new ConditionCheckHandler();
    const context = { task: 'Normal task content' };

    const config = {
      patterns: [
        {
          regex: '<script[^>]*>.*?</script>',
          stop: true,
        },
      ],
    };

    const result = await handler.execute(context, config);

    expect(result).toBeUndefined();
  });
});

describe('MiddlewareHandler', () => {
  it('should set context values', async () => {
    const handler = new MiddlewareHandler();
    const context: any = { task: 'Test' };

    const config = {
      set: {
        'metadata.enriched': true,
        'metadata.timestamp': '2024-01-01',
      },
    };

    await handler.execute(context, config);

    expect(context.metadata.enriched).toBe(true);
    expect(context.metadata.timestamp).toBe('2024-01-01');
  });

  it('should remove context values', async () => {
    const handler = new MiddlewareHandler();
    const context: any = {
      task: 'Test',
      sensitiveData: 'secret',
    };

    const config = {
      remove: ['sensitiveData'],
    };

    await handler.execute(context, config);

    expect(context.sensitiveData).toBeUndefined();
  });
});

describe('NotificationHandler', () => {
  it('should skip notification when condition not met', async () => {
    const handler = new NotificationHandler();
    const context = { status: 'completed' };

    const config = {
      channel: 'lark',
      message_template: 'Task {{ status }}',
      send_when: [
        {
          field: 'status',
          operator: '==',
          value: 'failed',
        },
      ],
    };

    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    await handler.execute(context, config);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send notification when condition met', async () => {
    const handler = new NotificationHandler();
    const context = { status: 'failed' };

    const config = {
      channel: 'lark',
      message_template: 'Task {{ status }}',
      send_when: [
        {
          field: 'status',
          operator: '==',
          value: 'failed',
        },
      ],
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0 }),
      text: async () => '',
    });

    global.fetch = mockFetch;

    await handler.execute(context, config);

    expect(mockFetch).toHaveBeenCalled();
  });
});
