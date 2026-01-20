/**
 * Retry Service
 *
 * Provides intelligent retry logic with exponential backoff for failed operations.
 * Distinguishes between retryable and non-retryable errors.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Jitter factor to add randomness (0-1, default: 0.1) */
  jitterFactor?: number;
}

export interface RetryOptions extends RetryConfig {
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

/**
 * Default retryable error checker
 */
export function isDefaultRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Retryable errors
  const retryablePatterns = [
    'timeout',
    'timed out',
    'etimedout',
    'econnrefused',
    'econnreset',
    'enotfound',
    'esockettimedout',
    'network',
    'temporary',
    'temporarily unavailable',
    'rate limit',
    'too many requests',
    'service unavailable',
  ];

  // Non-retryable errors (explicit exclusion)
  const nonRetryablePatterns = [
    'syntax error',
    'type error',
    'reference error',
    'permission denied',
    'access denied',
    'unauthorized',
    'forbidden',
    'not found',
    'invalid',
    'validation',
    'eisdir', // Is a directory
    'enoent', // No such file or directory (only retry for network, not local files)
  ];

  // Check non-retryable patterns first
  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern) || name.includes(pattern)) {
      return false;
    }
  }

  // Check retryable patterns
  for (const pattern of retryablePatterns) {
    if (message.includes(pattern) || name.includes(pattern)) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const {
    baseDelay = 1000,
    maxDelay = 30000,
    exponentialBackoff = true,
    jitterFactor = 0.1,
  } = config;

  let delay: number;

  if (exponentialBackoff) {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  } else {
    // Linear backoff
    delay = Math.min(baseDelay * attempt, maxDelay);
  }

  // Add jitter to avoid thundering herd
  if (jitterFactor > 0) {
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }

  return Math.floor(delay);
}

/**
 * Retry an operation with intelligent backoff
 *
 * @param operation - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise with retry result
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    isRetryable = isDefaultRetryableError,
    onRetry,
    ...retryConfig
  } = options;

  let lastError: Error | undefined;
  let totalDelay = 0;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // First attempt (attempt = 0) or retry attempt (attempt > 0)
      const data = await operation();

      // Success
      return {
        success: true,
        data,
        attempts: attempt + 1,
        totalDelay,
      };
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // Check if we should retry
      if (attempt > maxRetries || !isRetryable(lastError)) {
        // Max retries reached or non-retryable error
        break;
      }

      // Calculate delay
      const delay = calculateRetryDelay(attempt, retryConfig);
      totalDelay += delay;

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError,
    attempts: attempt,
    totalDelay,
  };
}

/**
 * Create a retry function with preset configuration
 */
export function createRetryFunction(options: RetryOptions = {}) {
  return <T>(operation: () => Promise<T>) => retryOperation(operation, options);
}
