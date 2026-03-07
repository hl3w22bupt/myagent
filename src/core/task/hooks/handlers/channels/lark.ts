/**
 * Lark (飞书) Notification Channel
 */

import { NotificationChannel } from '../notification';

export class LarkNotificationChannel implements NotificationChannel {
  async send(params: { webhook: string; message: string; config?: any }): Promise<void> {
    const config = params.config || {};

    // Build message based on msg_type
    let body: any;

    const msgType = config.msg_type || 'text';

    switch (msgType) {
      case 'text':
        body = {
          msg_type: 'text',
          content: {
            text: params.message,
          },
        };
        break;

      case 'post':
        body = {
          msg_type: 'post',
          content: {
            post: {
              zh_cn: {
                title: config.title || '通知',
                content: [
                  [
                    {
                      tag: 'text',
                      text: params.message,
                    },
                  ],
                ],
              },
            },
          },
        };
        break;

      case 'interactive':
        body = {
          msg_type: 'interactive',
          card: {
            header: config.header || {
              title: {
                tag: 'plain_text',
                content: config.title || '通知',
              },
            },
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'plain_text',
                  content: params.message,
                },
              },
            ],
          },
        };
        break;

      default:
        body = {
          msg_type: 'text',
          content: {
            text: params.message,
          },
        };
    }

    const response = await fetch(params.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lark notification failed: ${response.status} ${errorText}`);
    }

    const result = await response.json() as { code: number; msg?: string };

    if (result.code !== 0) {
      throw new Error(`Lark notification error: ${result.msg}`);
    }
  }
}
