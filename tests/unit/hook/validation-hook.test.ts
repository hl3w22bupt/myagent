/**
 * Validation Hook Tests
 *
 * Tests for SchemaValidator, CompletenessValidator, FormatValidator, and ValidationHook
 */

import { describe, it, expect } from '@jest/globals';
import {
  ValidationHook,
  ValidationResult,
  SchemaValidator,
  CompletenessValidator,
  FormatValidator,
  ValidationError,
  ValidationConfig,
} from '@/core/hook/validation/validation-hook';

describe('ValidationResult', () => {
  it('should create success result', () => {
    const result = ValidationResult.success();
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should create failure result with errors', () => {
    const result = ValidationResult.failure(['Error 1', 'Error 2']);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Error 1', 'Error 2']);
  });

  it('should combine multiple results', () => {
    const result1 = ValidationResult.failure(['Error 1']);
    const result2 = ValidationResult.failure(['Error 2'], ['Warning 1']);
    const result3 = ValidationResult.success();

    const combined = ValidationResult.combine(result1, result2, result3);

    expect(combined.valid).toBe(false);
    expect(combined.errors).toEqual(['Error 1', 'Error 2']);
    expect(combined.warnings).toEqual(['Warning 1']);
  });
});

describe('SchemaValidator', () => {
  it('should validate valid string output', () => {
    const schema = {
      name: { type: 'string', minLength: 3 },
    };
    const validator = new SchemaValidator(schema);

    const result = validator.validate({ name: 'Alice' });

    expect(result.valid).toBe(true);
  });

  it('should fail validation for string too short', () => {
    const schema = {
      name: { type: 'string', minLength: 5 },
    };
    const validator = new SchemaValidator(schema);

    const result = validator.validate({ name: 'Bob' });

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should validate number output', () => {
    const schema = {
      age: { type: 'number', min: 0, max: 150 },
    };
    const validator = new SchemaValidator(schema);

    const result = validator.validate({ age: 25 });

    expect(result.valid).toBe(true);
  });

  it('should validate array output', () => {
    const schema = {
      items: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      },
    };
    const validator = new SchemaValidator(schema);

    const result = validator.validate({ items: ['apple', 'banana'] });

    expect(result.valid).toBe(true);
  });

  it('should validate nested object', () => {
    const schema = {
      user: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      },
    };
    const validator = new SchemaValidator(schema);

    const result = validator.validate({ user: { name: 'Alice', age: 30 } });

    expect(result.valid).toBe(true);
  });
});

describe('CompletenessValidator', () => {
  it('should pass validation when all required fields present', () => {
    const validator = new CompletenessValidator(['name', 'email']);

    const result = validator.validate({ name: 'Alice', email: 'alice@example.com' });

    expect(result.valid).toBe(true);
  });

  it('should fail validation when required field missing', () => {
    const validator = new CompletenessValidator(['name', 'email']);

    const result = validator.validate({ name: 'Alice' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: email');
  });

  it('should support nested field paths', () => {
    const validator = new CompletenessValidator(['user.name', 'user.email']);

    const result = validator.validate({
      user: { name: 'Alice', email: 'alice@example.com' },
    });

    expect(result.valid).toBe(true);
  });

  it('should fail validation for nested field when missing', () => {
    const validator = new CompletenessValidator(['user.name', 'user.email']);

    const result = validator.validate({ user: { name: 'Alice' } });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: user.email');
  });
});

describe('FormatValidator', () => {
  it('should validate email format', () => {
    const rules = [
      {
        field: 'email',
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        message: 'Invalid email format',
      },
    ];
    const validator = new FormatValidator(rules);

    const result = validator.validate({ email: 'user@example.com' });

    expect(result.valid).toBe(true);
  });

  it('should fail validation for invalid email', () => {
    const rules = [
      {
        field: 'email',
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        message: 'Invalid email format',
      },
    ];
    const validator = new FormatValidator(rules);

    const result = validator.validate({ email: 'not-an-email' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  it('should validate using RegExp pattern', () => {
    const rules = [
      {
        field: 'id',
        pattern: /^[A-Z]{2}-\d+$/,
        message: 'ID must match format: XX-123',
      },
    ];
    const validator = new FormatValidator(rules);

    const result = validator.validate({ id: 'AB-123' });

    expect(result.valid).toBe(true);
  });

  it('should fail validation for wrong format', () => {
    const rules = [
      {
        field: 'id',
        pattern: /^[A-Z]{2}-\d+$/,
        message: 'ID must match format: XX-123',
      },
    ];
    const validator = new FormatValidator(rules);

    const result = validator.validate({ id: 'abc-123' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ID must match format: XX-123');
  });

  it('should skip validation when field is missing', () => {
    const rules = [
      {
        field: 'email',
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        message: 'Invalid email format',
      },
    ];
    const validator = new FormatValidator(rules);

    const result = validator.validate({}); // No email field

    expect(result.valid).toBe(true);
  });
});

describe('ValidationHook', () => {
  it('should validate output with multiple validators', async () => {
    const config: ValidationConfig = {
      strategy: 'strict',
      required: ['id', 'title'],
      formats: [
        {
          field: 'id',
          pattern: '^[A-Z]{2}-\\d+$',
          message: 'Invalid ID format',
        },
      ],
    };

    const hook = new ValidationHook(config);

    const validOutput = { id: 'AB-123', title: 'Test Title' };
    const invalidOutput = { id: 'abc', title: 'Test' };

    const validResult = await hook.validate(validOutput);
    const invalidResult = await hook.validate(invalidOutput);

    expect(validResult.valid).toBe(true);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors?.length).toBeGreaterThan(0);
  });

  it('should support strict strategy (throw on failure)', async () => {
    const config: ValidationConfig = {
      strategy: 'strict',
      required: ['id'],
    };

    const hook = new ValidationHook(config);
    const output = {}; // Missing required field

    const result = await hook.validate(output);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: id');
  });

  it('should support fallback strategy (no throw)', async () => {
    const config: ValidationConfig = {
      strategy: 'fallback',
      required: ['id'],
    };

    const hook = new ValidationHook(config);
    const output = { name: 'Alice' }; // Missing id

    const result = await hook.validate(output);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should sanitize output in fallback mode', () => {
    const config: ValidationConfig = {
      strategy: 'fallback',
      required: ['id'],
    };

    const hook = new ValidationHook(config);
    const output = { name: 'Alice', age: null, city: undefined };

    const sanitized = hook.sanitizeOutput(output);

    expect(sanitized).toEqual({ name: 'Alice' });
    expect(sanitized.age).toBeUndefined();
    expect(sanitized.city).toBeUndefined();
  });
});

describe('ValidationError', () => {
  it('should create error with message and errors array', () => {
    const error = new ValidationError(['Error 1', 'Error 2'], 'Custom message');

    expect(error.message).toBe('Custom message');
    expect(error.errors).toEqual(['Error 1', 'Error 2']);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should have default message', () => {
    const error = new ValidationError(['Error 1']);

    expect(error.message).toBe('Validation failed: Error 1');
  });
});
