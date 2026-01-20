/**
 * Tests for Retry functionality
 */

import {
  retryOperation,
  calculateRetryDelay,
  isDefaultRetryableError,
  createRetryFunction,
  type RetryConfig,
} from '../../../src/core/agent/retry';

describe('Retry Service', () => {
  describe('calculateRetryDelay', () => {
    it('should calculate linear backoff delays', () => {
      const config: RetryConfig = {
        baseDelay: 1000,
        maxDelay: 10000,
        exponentialBackoff: false,
        jitterFactor: 0,
      };

      expect(calculateRetryDelay(1, config)).toBe(1000); // 1 * 1000
      expect(calculateRetryDelay(2, config)).toBe(2000); // 2 * 1000
      expect(calculateRetryDelay(3, config)).toBe(3000); // 3 * 1000
      expect(calculateRetryDelay(10, config)).toBe(10000); // Cap at maxDelay
    });

    it('should calculate exponential backoff delays', () => {
      const config: RetryConfig = {
        baseDelay: 1000,
        maxDelay: 30000,
        exponentialBackoff: true,
        jitterFactor: 0,
      };

      expect(calculateRetryDelay(1, config)).toBe(1000); // 1000 * 2^0
      expect(calculateRetryDelay(2, config)).toBe(2000); // 1000 * 2^1
      expect(calculateRetryDelay(3, config)).toBe(4000); // 1000 * 2^2
      expect(calculateRetryDelay(4, config)).toBe(8000); // 1000 * 2^3
      expect(calculateRetryDelay(10, config)).toBe(30000); // Cap at maxDelay
    });

    it('should add jitter to delays', () => {
      const config: RetryConfig = {
        baseDelay: 1000,
        maxDelay: 10000,
        exponentialBackoff: false,
        jitterFactor: 0.1,
      };

      const delay1 = calculateRetryDelay(1, config);
      const delay2 = calculateRetryDelay(1, config);

      // With jitter, delays should be slightly different
      expect(delay1).toBeGreaterThanOrEqual(900); // 1000 - 100
      expect(delay1).toBeLessThanOrEqual(1100); // 1000 + 100
      expect(delay2).not.toBe(delay1); // Random jitter should make them different
    });
  });

  describe('isDefaultRetryableError', () => {
    it('should identify retryable timeout errors', () => {
      const timeoutError = new Error('Operation timed out');
      expect(isDefaultRetryableError(timeoutError)).toBe(true);
    });

    it('should identify retryable network errors', () => {
      const networkErrors = [
        new Error('ECONNREFUSED'),
        new Error('ECONNRESET'),
        new Error('ENOTFOUND'),
        new Error('Network error occurred'),
      ];

      networkErrors.forEach((error) => {
        expect(isDefaultRetryableError(error)).toBe(true);
      });
    });

    it('should not retry syntax errors', () => {
      const syntaxError = new Error('SyntaxError: Unexpected token');
      expect(isDefaultRetryableError(syntaxError)).toBe(false);
    });

    it('should not retry permission errors', () => {
      const permissionErrors = [
        new Error('Permission denied'),
        new Error('Access denied'),
        new Error('Unauthorized'),
      ];

      permissionErrors.forEach((error) => {
        expect(isDefaultRetryableError(error)).toBe(false);
      });
    });

    it('should not retry validation errors', () => {
      const validationError = new Error('Validation failed: Invalid input');
      expect(isDefaultRetryableError(validationError)).toBe(false);
    });

    it('should not retry file not found errors', () => {
      const notFoundError = new Error('ENOENT: file not found');
      expect(isDefaultRetryableError(notFoundError)).toBe(false);
    });
  });

  describe('retryOperation', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await retryOperation(operation, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelay).toBe(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry retryable errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Operation timed out'))
        .mockResolvedValue('success');

      const result = await retryOperation(operation, {
        maxRetries: 3,
        baseDelay: 100,
        exponentialBackoff: false,
        jitterFactor: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.totalDelay).toBe(100);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('SyntaxError: Unexpected token'));

      const result = await retryOperation(operation, {
        maxRetries: 3,
        baseDelay: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(1); // No retries
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust max retries for retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation timed out'));

      const result = await retryOperation(operation, {
        maxRetries: 2,
        baseDelay: 100,
        exponentialBackoff: false,
        jitterFactor: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(result.totalDelay).toBe(300); // 100 + 200
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Operation timed out'))
        .mockRejectedValueOnce(new Error('Operation timed out'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retryOperation(operation, {
        maxRetries: 3,
        baseDelay: 100,
        exponentialBackoff: false,
        jitterFactor: 0,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 200);
    });

    it('should use custom isRetryable function', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Custom error'))
        .mockResolvedValue('success');

      const customIsRetryable = jest.fn().mockReturnValue(true);

      const result = await retryOperation(operation, {
        maxRetries: 3,
        baseDelay: 100,
        isRetryable: customIsRetryable,
      });

      expect(result.success).toBe(true);
      expect(customIsRetryable).toHaveBeenCalled();
      expect(result.attempts).toBe(2);
    });
  });

  describe('createRetryFunction', () => {
    it('should create a reusable retry function', async () => {
      const retryWithDefaults = createRetryFunction({
        maxRetries: 2,
        baseDelay: 100,
      });

      const operation1 = jest.fn().mockResolvedValue('success1');
      const operation2 = jest
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success2');

      const result1 = await retryWithDefaults(operation1);
      const result2 = await retryWithDefaults(operation2);

      expect(result1.success).toBe(true);
      expect(result1.attempts).toBe(1);

      expect(result2.success).toBe(true);
      expect(result2.attempts).toBe(2);
    });
  });

  describe('integration tests', () => {
    it('should handle real-world timeout scenario', async () => {
      let attempts = 0;
      const flakyOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ETIMEDOUT: Connection timeout');
        }
        return 'success';
      };

      const result = await retryOperation(flakyOperation, {
        maxRetries: 5,
        baseDelay: 50,
        exponentialBackoff: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      // Recovered means: success after multiple attempts
      const recovered = result.success && result.attempts > 1;
      expect(recovered).toBe(true);
    });

    it('should fail fast for non-retryable errors', async () => {
      const badOperation = async () => {
        throw new Error('Permission denied: Access denied');
      };

      const result = await retryOperation(badOperation, {
        maxRetries: 5,
        baseDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry
      expect(result.totalDelay).toBe(0);
    });
  });
});
