/**
 * Rate Limiter for Knowledge Base Operations
 *
 * Prevents abuse and ensures fair usage of knowledge base resources.
 * Uses sliding window algorithm for accurate rate limiting.
 */

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // seconds until retry
}

/**
 * Request record for tracking
 */
interface RequestRecord {
  count: number;
  windowStart: number;
}

/**
 * In-memory rate limiter using sliding window
 *
 * For production use, consider using Redis for distributed rate limiting.
 */
export class RateLimiter {
  private requests: Map<string, RequestRecord> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }) {
    this.config = config;

    // Periodically clean up old records
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  /**
   * Check if request is allowed for a given key
   *
   * @param key - Identifier (e.g., app ID, IP address)
   * @returns Rate limit check result
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const record = this.requests.get(key);

    // No previous record or window expired
    if (!record || now - record.windowStart > this.config.windowMs) {
      const newRecord: RequestRecord = {
        count: 1,
        windowStart: now,
      };

      this.requests.set(key, newRecord);

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: new Date(now + this.config.windowMs),
      };
    }

    // Window is still active
    if (record.count < this.config.maxRequests) {
      record.count++;

      return {
        allowed: true,
        remaining: this.config.maxRequests - record.count,
        resetTime: new Date(record.windowStart + this.config.windowMs),
      };
    }

    // Rate limit exceeded
    const windowEnd = record.windowStart + this.config.windowMs;
    const retryAfter = Math.ceil((windowEnd - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(windowEnd),
      retryAfter,
    };
  }

  /**
   * Reset rate limit for a specific key
   *
   * @param key - Identifier to reset
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clean up expired records
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, record] of this.requests.entries()) {
      if (now - record.windowStart > this.config.windowMs) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.requests.delete(key);
    }
  }

  /**
   * Get current usage statistics
   *
   * @param key - Identifier
   * @returns Current usage or null if no record exists
   */
  getUsage(key: string): { count: number; windowStart: number } | null {
    const record = this.requests.get(key);
    if (!record) {
      return null;
    }

    return {
      count: record.count,
      windowStart: record.windowStart,
    };
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.requests.clear();
  }
}

/**
 * Global rate limiter instances
 */
const limiters: Map<string, RateLimiter> = new Map();

/**
 * Get or create a rate limiter for a specific purpose
 *
 * @param name - Rate limiter name (e.g., 'retrieval', 'ingestion')
 * @param config - Rate limit configuration
 * @returns Rate limiter instance
 */
export function getRateLimiter(name: string, config?: RateLimitConfig): RateLimiter {
  if (!limiters.has(name)) {
    const limiter = new RateLimiter(config);
    limiters.set(name, limiter);
  }

  return limiters.get(name)!;
}

/**
 * Check retrieval rate limit for an app
 *
 * @param appId - Application ID
 * @returns Rate limit check result
 */
export function checkRetrievalRateLimit(appId: string): RateLimitResult {
  // Default: 100 requests per minute per app
  const limiter = getRateLimiter('retrieval', {
    maxRequests: 100,
    windowMs: 60000,
  });

  return limiter.check(appId);
}

/**
 * Check ingestion rate limit for an app
 *
 * @param appId - Application ID
 * @returns Rate limit check result
 */
export function checkIngestionRateLimit(appId: string): RateLimitResult {
  // Default: 10 requests per minute per app (ingestion is more expensive)
  const limiter = getRateLimiter('ingestion', {
    maxRequests: 10,
    windowMs: 60000,
  });

  return limiter.check(appId);
}

/**
 * Reset rate limit for an app
 *
 * @param appId - Application ID
 * @param type - Rate limit type ('retrieval' or 'ingestion')
 */
export function resetRateLimit(appId: string, type: 'retrieval' | 'ingestion' = 'retrieval'): void {
  const limiter = limiters.get(type);
  if (limiter) {
    limiter.reset(appId);
  }
}

/**
 * Close all rate limiters
 */
export function closeAllLimiters(): void {
  for (const limiter of limiters.values()) {
    limiter.destroy();
  }
  limiters.clear();
}
