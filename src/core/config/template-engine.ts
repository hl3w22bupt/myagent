/**
 * Template Engine for variable substitution in hooks and workflows.
 *
 * Supports:
 * - {{ env.XXX }} - Environment variables
 * - {{ xxx }} - Context variables
 * - Nested paths: {{ xxx.yyy.zzz }}
 */

export interface TemplateContext {
  [key: string]: any;
}

export class TemplateEngine {
  constructor(private context: TemplateContext) {}

  /**
   * Render any value, handling strings, objects, and primitives
   */
  render(template: any): any {
    if (typeof template === 'string') {
      return this.renderString(template);
    }
    if (typeof template === 'object' && template !== null) {
      if (Array.isArray(template)) {
        return template.map(item => this.render(item));
      }
      const result: any = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.render(value);
      }
      return result;
    }
    return template;
  }

  /**
   * Render a string template with variable substitution
   * Preserves type when the entire string is a single template variable
   */
  renderString(str: string): any {
    // Check if the entire string is a single template variable
    const singleVarMatch = str.match(/^\{\{([^}]+)\}\}$/);
    if (singleVarMatch) {
      const trimmed = singleVarMatch[1].trim();
      if (trimmed.startsWith('env.')) {
        const envKey = trimmed.substring(4);
        return process.env[envKey] || '';
      }
      // Return the actual value, not stringified
      return this.resolvePath(trimmed);
    }

    // String interpolation: replace templates with stringified values
    return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const trimmed = path.trim();

      // Environment variables
      if (trimmed.startsWith('env.')) {
        const envKey = trimmed.substring(4);
        return process.env[envKey] || '';
      }

      // Context variables - stringify for interpolation
      const value = this.resolvePath(trimmed);
      return value === undefined || value === null ? '' : String(value);
    });
  }

  /**
   * Render a single value (can be string with template or any other type)
   */
  renderValue(value: any): any {
    if (typeof value === 'string' && value.includes('{{')) {
      return this.renderString(value);
    }
    if (typeof value === 'object' && value !== null) {
      return this.render(value);
    }
    return value;
  }

  /**
   * Resolve a dot-notation path from context
   */
  resolvePath(path: string): any {
    const parts = path.split('.');
    return parts.reduce((obj, key) => {
      if (obj && typeof obj === 'object' && key in obj) {
        return obj[key];
      }
      return undefined;
    }, this.context);
  }

  /**
   * Extract a value from an object using JSONPath-like syntax
   */
  extractValue(obj: any, path: string): any {
    if (!path) return obj;

    // JSONPath style: $.field.nested
    if (path.startsWith('$.')) {
      const cleanPath = path.substring(2);
      return this.extractByDotNotation(obj, cleanPath);
    }

    // Direct dot notation
    return this.extractByDotNotation(obj, path);
  }

  private extractByDotNotation(obj: any, path: string): any {
    const parts = path.split('.');
    return parts.reduce((o, key) => {
      if (o && typeof o === 'object' && key in o) {
        return o[key];
      }
      return undefined;
    }, obj);
  }
}
