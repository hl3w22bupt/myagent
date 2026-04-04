/**
 * Collection Name Validator
 *
 * Validates and sanitizes knowledge collection names to prevent SQL injection
 * and ensure security.
 */

import { getPool } from '../app-knowledge-manager';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
}

/**
 * Validate collection name according to security rules
 *
 * Rules:
 * - Must start with letter or underscore
 * - Can contain letters, numbers, underscore, hyphen
 * - Length: 1-64 characters
 * - No SQL injection patterns
 * - No path traversal patterns
 *
 * @param name - Collection name to validate
 * @returns Validation result
 */
export function validateCollectionName(name: string): ValidationResult {
  // Check type
  if (typeof name !== 'string') {
    return { valid: false, error: 'Collection name must be a string' };
  }

  // Check length
  if (name.length === 0 || name.length > 64) {
    return { valid: false, error: 'Collection name must be 1-64 characters' };
  }

  // Check for SQL injection patterns
  const sqlInjectionPatterns = [
    /--/, // SQL comment
    /;/, // Statement separator
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i, // SQL keywords
    /'/, // Single quote
    /"/, // Double quote
    /\b(OR|AND)\s+\w+\s*=\s*\w+/i, // SQL boolean injection
    /\bUNION\s+SELECT\b/i, // Union-based injection
  ];

  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(name)) {
      return { valid: false, error: 'Collection name contains potentially dangerous characters' };
    }
  }

  // Check for path traversal
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Collection name cannot contain path traversal characters' };
  }

  // Validate format: start with letter or underscore, followed by alphanumeric, underscore, or hyphen
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error: 'Collection name must start with letter or underscore, and contain only letters, numbers, underscore, or hyphen'
    };
  }

  // Sanitize: return the name as-is (already validated)
  return { valid: true, sanitizedName: name };
}

/**
 * Validate app ID according to security rules
 *
 * Uses same rules as collection name validation
 *
 * @param appId - App ID to validate
 * @returns Validation result
 */
export function validateAppId(appId: string): ValidationResult {
  return validateCollectionName(appId);
}

/**
 * Validate field name (column name) according to security rules
 *
 * @param fieldName - Field name to validate
 * @returns Validation result
 */
export function validateFieldName(fieldName: string): ValidationResult {
  // Field names follow same rules as collection names
  return validateCollectionName(fieldName);
}

/**
 * Batch validate multiple collection names
 *
 * @param names - Array of collection names to validate
 * @returns Array of validation results
 */
export function validateCollectionNames(names: string[]): ValidationResult[] {
  return names.map(validateCollectionName);
}

/**
 * Check if collection name is reserved
 *
 * @param name - Collection name to check
 * @returns True if name is reserved
 */
export function isReservedCollectionName(name: string): boolean {
  const reservedNames = [
    'tasks',
    'sessions',
    'context_messages',
    'schema_migrations',
    'artifacts',
    'outputs',
    'compression_history',
    'favorites',
    'soul_contexts',
    'soul_execution_history',
    'soul_notifications',
    'soul_states',
    'task_contexts',
    'token_usage_aggregation_state',
    'token_usage_by_model',
    'token_usage_by_skill',
    'token_usage_processed_traces',
    'token_usage_task',
    'users',
    'app_knowledge_mappings',
    'knowledge_datasources',
  ];

  return reservedNames.includes(name.toLowerCase());
}
