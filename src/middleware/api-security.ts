/**
 * API Security Middleware.
 *
 * Provides authentication and rate limiting for API endpoints.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory rate limiter.
 *
 * In production, use Redis-based rate limiting for distributed systems.
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be rate limited.
   */
  isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests for this identifier
    let timestamps = this.requests.get(identifier) || [];

    // Filter out old requests outside the window
    timestamps = timestamps.filter((t) => t > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= this.maxRequests) {
      return true;
    }

    // Add current request
    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    return false;
  }

  /**
   * Clean up old entries.
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter((t) => t > windowStart);

      if (validTimestamps.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validTimestamps);
      }
    }
  }

  /**
   * Get current usage stats.
   */
  getStats(identifier: string): { count: number; remaining: number; resetAt: number } {
    const timestamps = this.requests.get(identifier) || [];
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    return {
      count: validTimestamps.length,
      remaining: Math.max(0, this.maxRequests - validTimestamps.length),
      resetAt: now + this.windowMs,
    };
  }
}

/**
 * Create rate limiter instance.
 */
export const createRateLimiter = (windowMs?: number, maxRequests?: number) => {
  return new RateLimiter(windowMs, maxRequests);
};

/**
 * Rate limiting middleware.
 */
export const rateLimitMiddleware = (
  rateLimiter: RateLimiter,
  getIdentifier: (req: Request) => string = (req) => req.ip || 'unknown'
) => {
  return (req: Request, res: Response, _next: NextFunction) => {
    const identifier = getIdentifier(req);

    if (rateLimiter.isRateLimited(identifier)) {
      const stats = rateLimiter.getStats(identifier);

      return res.status(429).json({
        _error: 'Too many requests',
        retryAfter: Math.ceil((stats.resetAt - Date.now()) / 1000),
      });
    }

    // Add rate limit headers
    const stats = rateLimiter.getStats(identifier);
    res.setHeader('X-RateLimit-Limit', rateLimiter['maxRequests']);
    res.setHeader('X-RateLimit-Remaining', stats.remaining);
    res.setHeader('X-RateLimit-Reset', stats.resetAt);

    _next();
  };
};

/**
 * API Key authentication middleware.
 */
export const apiKeyAuthMiddleware = (validApiKeys: Set<string> = new Set()) => {
  // Add API key from environment if available
  if (process.env.API_KEY) {
    validApiKeys.add(process.env.API_KEY);
  }

  return (req: Request, res: Response, _next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    // If no valid API keys configured, skip authentication
    if (validApiKeys.size === 0) {
      return _next();
    }

    // Check if API key is provided and valid
    if (!apiKey) {
      return res.status(401).json({
        _error: 'API key required',
        message: 'Please provide X-API-Key header',
      });
    }

    if (!validApiKeys.has(apiKey)) {
      return res.status(403).json({
        _error: 'Invalid API key',
        message: 'The provided API key is not valid',
      });
    }

    _next();
  };
};

/**
 * CORS middleware.
 */
export const corsMiddleware = (allowedOrigins: string[] = ['*']) => {
  return (req: Request, res: Response, _next: NextFunction) => {
    const origin = req.headers.origin;

    if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    _next();
  };
};

/**
 * Request logging middleware.
 */
export const requestLoggingMiddleware = (logger: any = console) => {
  return (req: Request, res: Response, _next: NextFunction) => {
    const startTime = Date.now();

    // Log request
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('API Response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });

    _next();
  };
};

/**
 * Security headers middleware.
 */
export const securityHeadersMiddleware = (req: Request, res: Response, _next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Restrict referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (basic)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );

  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  _next();
};

/**
 * Error handler middleware.
 */
export const _errorHandlerMiddleware = (logger: any = console) => {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger._error('API Error', {
      _error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // Don't leak  _error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(500).json({
      _error: 'Internal server  _error',
      message: isDevelopment ? err.message : 'An unexpected  _error occurred',
      ...(isDevelopment && { stack: err.stack }),
    });
  };
};
