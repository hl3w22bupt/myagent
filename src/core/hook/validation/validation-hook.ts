/**
 * Validation Hook - Agent Output Validation
 *
 * Provides validation mechanism for Agent outputs using Zod and custom validators.
 * Supports multiple validation types: schema, completeness, format.
 *
 * Usage:
 *   Configure validation in agent.yaml:
 *   ```yaml
 *   hooks:
 *     validation:
 *       strategy: strict  # strict | fallback
 *       schema:
 *         userStories:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, title, priority]
 *   ```
 */

import { z } from 'zod';
import { BaseAgentHook } from '@/core/agent/hooks/base';
import type { AgentResult, AgentConfig } from '@/core/agent/types';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Validation result
 */
export class ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];

  constructor(valid: boolean, errors?: string[], warnings?: string[]) {
    this.valid = valid;
    this.errors = errors;
    this.warnings = warnings;
  }

  /**
   * Create a successful validation result
   */
  static success(): ValidationResult {
    return new ValidationResult(true);
  }

  /**
   * Create a failed validation result
   */
  static failure(errors: string[], warnings?: string[]): ValidationResult {
    return new ValidationResult(false, errors, warnings);
  }

  /**
   * Combine multiple validation results
   */
  static combine(...results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap(r => r.errors || []);
    const allWarnings = results.flatMap(r => r.warnings || []);

    return new ValidationResult(
      allErrors.length === 0,
      allErrors.length > 0 ? allErrors : undefined,
      allWarnings.length > 0 ? allWarnings : undefined
    );
  }
}

/**
 * Validator interface
 */
export interface Validator {
  /**
   * Validate output
   */
  validate(output: any): ValidationResult | Promise<ValidationResult>;
}

/**
 * Validation strategy
 */
export type ValidationStrategy = 'strict' | 'fallback';

/**
 * Validation configuration from agent.yaml
 */
export interface ValidationConfig {
  strategy?: ValidationStrategy;
  schema?: Record<string, any>;
  required?: string[];
  formats?: FormatRule[];
  custom?: CustomValidatorConfig[];
}

/**
 * Format validation rule
 */
export interface FormatRule {
  field: string;
  pattern: string | RegExp;
  message?: string;
}

/**
 * Custom validator configuration
 */
export interface CustomValidatorConfig {
  name: string;
  check: string; // JavaScript expression
  message: string;
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  public code: string = 'VALIDATION_ERROR';
  public errors: string[];

  constructor(errors: string[], message?: string) {
    super(message || `Validation failed: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// ============================================================================
// Built-in Validators
// ============================================================================

/**
 * Schema Validator - validates output structure using Zod
 */
export class SchemaValidator implements Validator {
  constructor(private schema: Record<string, any>) {}

  validate(output: any): ValidationResult {
    try {
      // Convert YAML config to Zod schema
      const zodSchema = this.yamlToZod(this.schema);
      const parsed = zodSchema.safeParse(output);

      if (parsed.success) {
        return ValidationResult.success();
      } else {
        const zodError = parsed.error;
        const errors = (zodError as any).issues.map((e: any) =>
          `${e.path.join('.')}: ${e.message}`
        );
        return ValidationResult.failure(errors);
      }
    } catch (error: any) {
      return ValidationResult.failure([`Schema validation error: ${error.message}`]);
    }
  }

  /**
   * Convert YAML schema definition to Zod schema
   * This is a simplified implementation - can be enhanced later
   */
  private yamlToZod(schema: Record<string, any>): z.ZodTypeAny {
    const zodSchema: Record<string, z.ZodTypeAny> = {};

    for (const [key, def] of Object.entries(schema)) {
      zodSchema[key] = this.convertDefinition(def);
    }

    return z.object(zodSchema);
  }

  /**
   * Convert a single definition to Zod type
   */
  private convertDefinition(def: any): z.ZodTypeAny {
    if (def.type === 'string') {
      let zodString = z.string();

      if (def.minLength) zodString = zodString.min(def.minLength);
      if (def.maxLength) zodString = zodString.max(def.maxLength);
      if (def.pattern) zodString = zodString.regex(new RegExp(def.pattern));

      return zodString;
    }

    if (def.type === 'number') {
      let zodNumber = z.number();

      if (def.min !== undefined) zodNumber = zodNumber.min(def.min);
      if (def.max !== undefined) zodNumber = zodNumber.max(def.max);

      return zodNumber;
    }

    if (def.type === 'boolean') {
      return z.boolean();
    }

    if (def.type === 'array') {
      let zodArray = z.array(this.convertDefinition(def.items || {}));

      if (def.minItems) zodArray = zodArray.min(def.minItems);
      if (def.maxItems) zodArray = zodArray.max(def.maxItems);

      return zodArray;
    }

    if (def.type === 'object') {
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = new Set(def.required || []);

      for (const [key, propDef] of Object.entries(def.properties || {})) {
        // If field is not in required list, make it optional
        const prop = this.convertDefinition(propDef);
        if (!required.has(key)) {
          shape[key] = prop.optional();
        } else {
          shape[key] = prop;
        }
      }

      return z.object(shape);
    }

    // Default: any type
    return z.any();
  }
}

/**
 * Completeness Validator - checks required fields
 */
export class CompletenessValidator implements Validator {
  constructor(private required: string[] = []) {}

  validate(output: any): ValidationResult {
    if (!output || typeof output !== 'object') {
      return ValidationResult.failure(['Output is not an object']);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of this.required) {
      const value = this.getNestedValue(output, field);

      if (value === undefined || value === null || value === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return new ValidationResult(errors.length === 0, errors, warnings);
  }

  /**
   * Get nested value from object using dot notation
   * Example: getNestedValue({a: {b: 1}}, 'a.b') => 1
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }
}

/**
 * Format Validator - validates field formats using regex
 */
export class FormatValidator implements Validator {
  constructor(private rules: FormatRule[] = []) {}

  validate(output: any): ValidationResult {
    if (!this.rules || this.rules.length === 0) {
      return ValidationResult.success();
    }

    const errors: string[] = [];

    for (const rule of this.rules) {
      const value = this.getNestedValue(output, rule.field);
      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern)
        : rule.pattern;

      if (value !== undefined && value !== null && value !== '') {
        if (!pattern.test(String(value))) {
          const message = rule.message || `Field '${rule.field}' format is invalid`;
          errors.push(message);
        }
      }
    }

    return new ValidationResult(errors.length === 0, errors);
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }
}

// ============================================================================
// Validation Hook
// ============================================================================

// ============================================================================
// Validation Hook - Agent Hook Implementation
// ============================================================================

/**
 * ValidationHook - validates Agent output on task completion
 *
 * This hook integrates with the Agent lifecycle by extending BaseAgentHook.
 * It validates Agent outputs in the onTaskComplete phase.
 */
export class ValidationHook extends BaseAgentHook {
  private validators: Validator[] = [];
  private strategy: ValidationStrategy = 'strict';
  private config: ValidationConfig;

  constructor(config: ValidationConfig) {
    super();
    this.config = config;
    this.strategy = config.strategy || 'strict';

    // Initialize validators based on config
    if (config.schema) {
      this.validators.push(new SchemaValidator(config.schema));
    }

    if (config.required && config.required.length > 0) {
      this.validators.push(new CompletenessValidator(config.required));
    }

    if (config.formats && config.formats.length > 0) {
      this.validators.push(new FormatValidator(config.formats));
    }
  }

  /**
   * Called before Agent is created.
   * No-op for validation hook.
   */
  async onAgentCreate(
    _config: AgentConfig,
    _sessionId: string
  ): Promise<{ abort?: boolean; reason?: string } | undefined> {
    // Validation hook doesn't need to intervene in agent creation
    return undefined;
  }

  /**
   * Called when Agent is acquired.
   * No-op for validation hook.
   */
  async onAgentAcquire(
    _agent: any,
    _sessionId: string
  ): Promise<void | undefined> {
    // Validation hook doesn't need to track agent acquisition
    return undefined;
  }

  /**
   * Called before task execution.
   * No-op for validation hook (validation happens after task completion).
   */
  async onTaskStart(
    _task: string,
    _taskId: string,
    _context: Partial<any>
  ): Promise<{ modifiedTask?: string } | undefined> {
    // Validation hook doesn't modify task before execution
    return undefined;
  }

  /**
   * Called after task execution completes - this is where validation happens!
   *
   * Validates the Agent output based on configured rules:
   * - Schema validation (structure and types)
   * - Completeness validation (required fields)
   * - Format validation (regex patterns)
   *
   * Strategy:
   * - strict: throws ValidationError on validation failure
   * - fallback: sanitizes output and logs warnings
   */
  async onTaskComplete(
    result: AgentResult,
    context: any
  ): Promise<void | undefined> {
    // Only validate if validators are configured
    if (this.validators.length === 0) {
      return undefined;
    }

    const validationResult = await this.validate(result.output);

    if (!validationResult.valid) {
      if (this.strategy === 'fallback') {
        // Fallback mode: log errors and sanitize output
        console.warn(
          `[ValidationHook] Output validation failed for task ${context.taskId}`,
          { errors: validationResult.errors, warnings: validationResult.warnings }
        );
        result.output = this.sanitizeOutput(result.output);
      } else {
        // Strict mode: throw validation error
        throw new ValidationError(
          validationResult.errors || ['Unknown validation error'],
          `Output validation failed for task ${context.taskId}`
        );
      }
    }

    return undefined;
  }

  /**
   * Called periodically to check Agent status.
   * No-op for validation hook.
   */
  async onAgentStatusCheck(
    _agent: any
  ): Promise<void | undefined> {
    // Validation hook doesn't monitor agent status
    return undefined;
  }

  /**
   * Called before Agent is destroyed.
   * No-op for validation hook.
   */
  async onAgentDestroy(
    _sessionId: string
  ): Promise<void | undefined> {
    // Validation hook doesn't need cleanup
    return undefined;
  }

  /**
   * Called when Agent requests human clarification (HITL).
   * No-op for validation hook.
   */
  async onAwaitingHITL(
    _question: string,
    _options?: string[],
    _agentContext?: {
      agentName: string;
      sessionId: string;
      taskId: string;
      intent?: any;
    }
  ): Promise<void | undefined> {
    // Validation hook doesn't handle HITL events
    return undefined;
  }

  /**
   * Validate Agent output
   */
  async validate(output: any): Promise<ValidationResult> {
    // Run all validators and combine results
    const results = await Promise.all(
      this.validators.map(v => v.validate(output))
    );

    return ValidationResult.combine(...results);
  }

  /**
   * Get validation strategy
   */
  getStrategy(): ValidationStrategy {
    return this.strategy;
  }

  /**
   * Sanitize output by removing invalid fields (fallback mode)
   */
  sanitizeOutput(output: any): any {
    // Basic implementation - remove null/undefined fields
    if (typeof output === 'object' && output !== null) {
      const sanitized: any = {};

      for (const [key, value] of Object.entries(output)) {
        if (value !== null && value !== undefined) {
          sanitized[key] = value;
        }
      }

      return sanitized;
    }

    return output;
  }
}
