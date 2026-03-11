/**
 * MessageIdGenerator 单元测试
 *
 * @author MyAgent Team
 * @version 1.0.0
 */

import { MessageIdGenerator } from './message-id-generator';

describe('MessageIdGenerator', () => {
  describe('generate()', () => {
    test('应该生成唯一的 messageId', () => {
      const id1 = MessageIdGenerator.generate();
      const id2 = MessageIdGenerator.generate();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
    });

    test('应该生成符合格式的 messageId', () => {
      const id = MessageIdGenerator.generate();

      expect(id).toMatch(/^msg-\d+-[a-z0-9]+$/i);
    });

    test('生成的 messageId 应该可以被验证', () => {
      const id = MessageIdGenerator.generate();

      expect(MessageIdGenerator.isValid(id)).toBe(true);
    });

    test('生成的 messageId 应该包含有效的时间戳', () => {
      const id = MessageIdGenerator.generate();
      const timestamp = MessageIdGenerator.getTimestamp(id);
      const now = Date.now();

      // 时间戳应该在最近1秒内
      expect(timestamp).toBeGreaterThan(now - 1000);
      expect(timestamp).toBeLessThanOrEqual(now);
    });
  });

  describe('isValid()', () => {
    test('应该验证有效的 messageId', () => {
      const validIds = [
        'msg-1712345678901-abc123',
        'msg-1000000000000-xyz789',
        'msg-9999999999999-abc999',
        'MSG-1234567890123-ABC123', // 大写也应该支持
      ];

      validIds.forEach(id => {
        expect(MessageIdGenerator.isValid(id)).toBe(true);
      });
    });

    test('应该拒绝无效的 messageId', () => {
      const invalidIds = [
        'invalid-format',
        'msg-123',
        'msg-abc123-def456', // 缺少时间戳
        'msg-1234567890123-abc', // 随机部分太短
        'msg-1234567890123-abcdef123456', // 随机部分太长
        '',
        null,
        undefined,
      ];

      invalidIds.forEach(id => {
        expect(MessageIdGenerator.isValid(id || '')).toBe(false);
      });
    });
  });

  describe('getTimestamp()', () => {
    test('应该从 messageId 中提取时间戳', () => {
      const messageId = 'msg-1712345678901-abc123';
      const timestamp = MessageIdGenerator.getTimestamp(messageId);

      expect(timestamp).toBe(1712345678901);
    });

    test('无效的 messageId 应该返回 0', () => {
      const timestamp = MessageIdGenerator.getTimestamp('invalid-format');
      expect(timestamp).toBe(0);
    });

    test('空的 messageId 应该返回 0', () => {
      const timestamp = MessageIdGenerator.getTimestamp('');
      expect(timestamp).toBe(0);
    });
  });

  describe('generateBatch()', () => {
    test('应该生成指定数量的 messageId', () => {
      const count = 5;
      const ids = MessageIdGenerator.generateBatch(count);

      expect(ids).toHaveLength(count);
      ids.forEach(id => {
        expect(MessageIdGenerator.isValid(id)).toBe(true);
      });
    });

    test('批量生成的 messageId 应该都是唯一的', () => {
      const count = 100;
      const ids = MessageIdGenerator.generateBatch(count);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(count);
    });
  });

  describe('getRandomPart()', () => {
    test('应该提取随机部分', () => {
      const messageId = 'msg-1712345678901-abc123';
      const random = MessageIdGenerator.getRandomPart(messageId);

      expect(random).toBe('abc123');
    });

    test('无效的 messageId 应该返回空字符串', () => {
      const random = MessageIdGenerator.getRandomPart('invalid');
      expect(random).toBe('');
    });
  });

  describe('compareAge()', () => {
    test('应该正确比较两个 messageId 的年龄', () => {
      const id1 = 'msg-1712345678901-abc123';
      const id2 = 'msg-1712345678800-xyz789';

      const diff = MessageIdGenerator.compareAge(id1, id2);

      // id1 比 id2 新 101ms
      expect(diff).toBe(101);
    });

    test('第一个较新时应该返回正数', () => {
      const id1 = 'msg-1712345678901-abc123';
      const id2 = 'msg-1712345678800-xyz789';

      const diff = MessageIdGenerator.compareAge(id1, id2);

      expect(diff).toBeGreaterThan(0);
    });

    test('第二个较新时应该返回负数', () => {
      const id1 = 'msg-1712345678800-xyz789';
      const id2 = 'msg-1712345678901-abc123';

      const diff = MessageIdGenerator.compareAge(id1, id2);

      expect(diff).toBeLessThan(0);
    });

    test('相同时应该返回 0', () => {
      const id = 'msg-1712345678901-abc123';

      const diff = MessageIdGenerator.compareAge(id, id);

      expect(diff).toBe(0);
    });
  });

  describe('isExpired()', () => {
    test('应该正确判断 messageId 是否过期', () => {
      const now = Date.now();
      const oldTimestamp = now - 70000; // 70秒前

      // 生成一个旧的 messageId（手动构造）
      const oldId = `msg-${oldTimestamp}-abc123`;

      expect(MessageIdGenerator.isExpired(oldId, 60000)).toBe(true);
      expect(MessageIdGenerator.isExpired(oldId, 80000)).toBe(false);
    });

    test('新生的 messageId 不应该过期', () => {
      const id = MessageIdGenerator.generate();

      expect(MessageIdGenerator.isExpired(id, 60000)).toBe(false);
    });
  });

  describe('边界情况', () => {
    test('时间戳边界测试', () => {
      const minTimestampId = 'msg-0-abc123';
      const maxTimestampId = 'msg-9999999999999-xyz789';

      expect(MessageIdGenerator.isValid(minTimestampId)).toBe(true);
      expect(MessageIdGenerator.isValid(maxTimestampId)).toBe(true);

      expect(MessageIdGenerator.getTimestamp(minTimestampId)).toBe(0);
      expect(MessageIdGenerator.getTimestamp(maxTimestampId)).toBe(9999999999999);
    });

    test('特殊字符测试', () => {
      const specialId = 'msg-1712345678901-AbC123'; // 混合大小写

      expect(MessageIdGenerator.isValid(specialId)).toBe(true);
      expect(MessageIdGenerator.getRandomPart(specialId)).toBe('AbC123');
    });
  });
});
