/**
 * Workflow Configuration Validator
 *
 * Validates workflow configurations at load time
 * - Detects duplicate output field names
 * - Detects conflicts with reserved names
 * - Detects undefined field references
 * - Detects cyclic dependencies
 */

import { ValidationError, WorkflowConfig, WorkflowStep } from './types';

const RESERVED_NAMES = ['input', 'output', 'env', 'loop', 'workflow', 'iteration'];

export class WorkflowValidator {
  /**
   * Validate a workflow configuration
   */
  validate(config: WorkflowConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Check output naming conflicts
    const outputErrors = this.validateOutputNames(config);
    errors.push(...outputErrors);

    // 2. Check input field references
    const referenceErrors = this.validateFieldReferences(config);
    errors.push(...referenceErrors);

    // 3. Check cyclic dependencies
    const cyclicErrors = this.validateDependencies(config);
    errors.push(...cyclicErrors);

    return errors;
  }

  /**
   * Validate output field names
   */
  private validateOutputNames(config: WorkflowConfig): ValidationError[] {
    const errors: ValidationError[] = [];
    const allOutputNames = new Set<string>();
    const outputToSteps = new Map<string, string>();

    for (const step of config.steps) {
      if (!step.output) continue;

      const fieldNames = Object.keys(step.output);
      const fieldValues = Object.values(step.output);

      // 1.1 Check for duplicate field names (keys)
      const duplicates = this.findDuplicates(fieldNames);
      if (duplicates.length > 0) {
        errors.push({
          stepId: step.id,
          field: duplicates.join(', '),
          error: `Duplicate output field in same step`,
        });
      }

      // 1.1b Check for duplicate source values within same step
      const valueToFields = new Map<string, string[]>();
      for (let i = 0; i < fieldNames.length; i++) {
        const sourcePath = this.getNormalizedSourcePath(fieldValues[i]);
        if (sourcePath) {
          const fields = valueToFields.get(sourcePath) || [];
          fields.push(fieldNames[i]);
          valueToFields.set(sourcePath, fields);
        }
      }

      for (const [sourcePath, fields] of valueToFields) {
        if (fields.length > 1) {
          errors.push({
            stepId: step.id,
            field: fields.join(', '),
            error: `Duplicate source path "${sourcePath}" used by multiple fields`,
          });
        }
      }

      // 1.2 Check for reserved names
      for (const field of fieldNames) {
        if (RESERVED_NAMES.includes(field)) {
          errors.push({
            stepId: step.id,
            field,
            error: `Cannot use reserved name: ${field}`,
          });
        }
      }

      // 1.3 Check for conflicts with other steps
      for (const field of fieldNames) {
        if (allOutputNames.has(field)) {
          const existingStep = outputToSteps.get(field);
          errors.push({
            stepId: step.id,
            field,
            error: `Conflict with output in step "${existingStep}"`,
          });
        } else {
          allOutputNames.add(field);
          outputToSteps.set(field, step.id);
        }
      }
    }

    return errors;
  }

  /**
   * Get normalized source path from output mapping
   */
  private getNormalizedSourcePath(value: any): string | null {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && value !== null && value.from) {
      return value.from;
    }
    return null;
  }

  /**
   * Validate that referenced fields exist
   */
  private validateFieldReferences(config: WorkflowConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    // Collect all available fields
    const availableFields = new Set<string>([
      ...RESERVED_NAMES,
    ]);

    // Add output fields from each step
    for (const step of config.steps) {
      if (step.output) {
        Object.keys(step.output).forEach(field => availableFields.add(field));
      }
    }

    // Check input references
    for (const step of config.steps) {
      if (!step.input) continue;

      const referencedFields = this.extractReferencedFields(step.input);
      for (const field of referencedFields) {
        const rootField = field.split('.')[0];
        if (!availableFields.has(rootField)) {
          errors.push({
            stepId: step.id,
            field: rootField,
            error: `Referenced field not defined: ${rootField}`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate dependencies for cycles
   */
  private validateDependencies(config: WorkflowConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    const cyclic = this.detectCyclicDependency(config.steps);
    if (cyclic) {
      errors.push({
        stepId: cyclic[0],
        field: 'depends_on',
        error: `Cyclic dependency: ${cyclic.join(' -> ')}`,
      });
    }

    return errors;
  }

  /**
   * Find duplicate elements in array
   */
  private findDuplicates(arr: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of arr) {
      if (seen.has(item)) {
        duplicates.add(item);
      }
      seen.add(item);
    }
    return Array.from(duplicates);
  }

  /**
   * Extract referenced fields from input config
   */
  private extractReferencedFields(input: Record<string, any>): string[] {
    const fields: string[] = [];

    for (const value of Object.values(input)) {
      if (typeof value === 'string') {
        // Extract {{ xxx }} template variables
        const matches = value.matchAll(/\{\{([^}]+)\}\}/g);
        for (const match of matches) {
          const path = match[1].trim();
          // Get root field name
          const rootField = path.split('.')[0];
          fields.push(rootField);
        }
      }
    }

    return fields;
  }

  /**
   * Detect cyclic dependencies using DFS
   */
  private detectCyclicDependency(steps: WorkflowStep[]): string[] | null {
    // Build dependency graph
    const graph = new Map<string, string[]>();
    for (const step of steps) {
      const deps = step.depends_on || [];
      // Validate that dependencies exist
      for (const dep of deps) {
        if (!steps.find(s => s.id === dep)) {
          // Dependency not found - skip in validation
          continue;
        }
      }
      graph.set(step.id, deps);
    }

    // DFS to detect cycles
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const dfs = (node: string, path: string[]): string[] | null => {
      if (path.includes(node)) {
        return [...path, node];
      }
      if (visited.has(node)) {
        return null;
      }

      visiting.add(node);
      const deps = graph.get(node) || [];

      for (const dep of deps) {
        if (!steps.find(s => s.id === dep)) continue; // Skip invalid deps
        const cycle = dfs(dep, [...path, node]);
        if (cycle) {
          return cycle;
        }
      }

      visiting.delete(node);
      visited.add(node);
      return null;
    };

    for (const stepId of graph.keys()) {
      const cycle = dfs(stepId, []);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }
}

/**
 * String iterator for regex matchAll
 * Note: Modern Node.js supports String.prototype.matchAll natively
 */
