/**
 * MessageId 生成器
 *
 * 生成唯一的消息标识符，用于追踪和匹配 message 与 taskResult
 *
 * @format: msg-{timestamp}-{random}
 * @example: msg-1712345678901-abc123
 *
 * @author MyAgent Team
 * @version 1.0.0
 * @since 2026-03-11
 */

export class MessageIdGenerator {
  /**
   * 生成唯一的 messageId
   *
   * 格式：msg-{timestamp}-{random}
   * - timestamp: 13位 Unix 时间戳（毫秒）
   * - random: 6位随机字符串（小写字母和数字）
   *
   * @returns {string} 唯一的 messageId
   *
   * @example
   * const messageId = MessageIdGenerator.generate();
   * // => "msg-1712345678901-abc123"
   */
  static generate(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `msg-${timestamp}-${random}`;
  }

  /**
   * 验证 messageId 格式
   *
   * 检查字符串是否符合 messageId 的格式规范
   *
   * @param {string} messageId - 待验证的 messageId
   * @returns {boolean} 如果格式正确返回 true，否则返回 false
   *
   * @example
   * MessageIdGenerator.isValid('msg-1712345678901-abc123'); // true
   * MessageIdGenerator.isValid('invalid-format'); // false
   */
  static isValid(messageId: string): boolean {
    return /^msg-\d+-[a-z0-9]+$/i.test(messageId);
  }

  /**
   * 从 messageId 中提取时间戳
   *
   * @param {string} messageId - messageId 字符串
   * @returns {number} Unix 时间戳（毫秒），如果无法提取返回 0
   *
   * @example
   * const timestamp = MessageIdGenerator.getTimestamp('msg-1712345678901-abc123');
   * // => 1712345678901
   */
  static getTimestamp(messageId: string): number {
    const match = messageId.match(/^msg-(\d+)-/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 生成批量 messageId（用于测试）
   *
   * @param {number} count - 要生成的数量
   * @returns {string[]} messageId 数组
   *
   * @example
   * const ids = MessageIdGenerator.generateBatch(5);
   * // => ["msg-1712345678901-abc123", "msg-1712345678902-def456", ...]
   */
  static generateBatch(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(MessageIdGenerator.generate());
    }
    return ids;
  }

  /**
   * 从 messageId 中提取随机部分
   *
   * @param {string} messageId - messageId 字符串
   * @returns {string} 随机部分，如果无法提取返回空字符串
   *
   * @example
   * const random = MessageIdGenerator.getRandomPart('msg-1712345678901-abc123');
   * // => "abc123"
   */
  static getRandomPart(messageId: string): string {
    const match = messageId.match(/-([a-z0-9]+)$/i);
    return match ? match[1] : '';
  }

  /**
   * 比较两个 messageId 的时间戳
   *
   * @param {string} messageId1 - 第一个 messageId
   * @param {string} messageId2 - 第二个 messageId
   * @returns {number} 时间差（毫秒），正值表示 messageId1 更新
   *
   * @example
   * const diff = MessageIdGenerator.compareAge(
   *   'msg-1712345678901-abc123',
   *   'msg-1712345678800-xyz789'
   * );
   * // => 101（第一个比第二个新 101ms）
   */
  static compareAge(messageId1: string, messageId2: string): number {
    const timestamp1 = MessageIdGenerator.getTimestamp(messageId1);
    const timestamp2 = MessageIdGenerator.getTimestamp(messageId2);
    return timestamp1 - timestamp2;
  }

  /**
   * 检查 messageId 是否过期
   *
   * @param {string} messageId - 待检查的 messageId
   * @param {number} maxAge - 最大年龄（毫秒）
   * @returns {boolean} 如果 messageId 超过 maxAge 返回 true
   *
   * @example
   * const isOld = MessageIdGenerator.isExpired(
   *   'msg-1712345678901-abc123',
   *   60000 // 60秒
   * );
   */
  static isExpired(messageId: string, maxAge: number): boolean {
    const timestamp = MessageIdGenerator.getTimestamp(messageId);
    const now = Date.now();
    return (now - timestamp) > maxAge;
  }
}
