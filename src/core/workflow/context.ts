/**
 * Workflow Context
 *
 * Manages variables and state during workflow execution
 */

import { WorkflowContextState } from './types';

export class WorkflowContext {
  private workflowId: string;
  private state: WorkflowContextState;
  private instanceStartTime: number;

  constructor(workflowId: string, input: Record<string, any> = {}) {
    this.workflowId = workflowId;
    this.instanceStartTime = Date.now();
    this.state = {
      input,
      output: {},
      variables: {},
      loop: {},
      stepStatus: {},
    };
  }

  /**
   * Get a variable from context
   * Supports:
   * - input.xxx -> workflow input
   * - output.xxx -> workflow output
   * - loop.xxx -> loop variables
   * - env.xxx -> environment variables
   * - xxx -> intermediate variables
   */
  get(path: string): any {
    if (!path) return undefined;

    const parts = path.split('.');
    const root = parts[0];

    // Environment variables
    if (root === 'env') {
      if (parts.length === 1) return undefined;
      return process.env[parts.slice(1).join('.')];
    }

    // Input
    if (root === 'input') {
      return this.getPath(this.state.input, parts.slice(1));
    }

    // Output
    if (root === 'output') {
      return this.getPath(this.state.output, parts.slice(1));
    }

    // Loop
    if (root === 'loop') {
      return this.getPath(this.state.loop, parts.slice(1));
    }

    // Iteration (parallel loop variable)
    if (root === 'iteration') {
      return this.state.loop.iteration;
    }

    // Intermediate variable
    return this.getPath(this.state.variables, parts);
  }

  /**
   * Set a variable in context
   */
  set(path: string, value: any): void {
    const parts = path.split('.');
    const root = parts[0];

    if (root === 'input') {
      this.setPath(this.state.input, parts.slice(1), value);
    } else if (root === 'output') {
      this.setPath(this.state.output, parts.slice(1), value);
    } else if (root === 'loop') {
      this.setPath(this.state.loop, parts.slice(1), value);
    } else {
      // Intermediate variable
      this.setPath(this.state.variables, parts, value);
    }
  }

  /**
   * Set step status
   */
  setStepStatus(stepId: string, status: 'completed' | 'failed' | 'skipped'): void {
    this.state.stepStatus[stepId] = status;
  }

  /**
   * Get step status
   */
  getStepStatus(stepId: string): 'completed' | 'failed' | 'skipped' | undefined {
    return this.state.stepStatus[stepId];
  }

  /**
   * Check if all dependencies are met
   */
  areDependenciesMet(stepId: string, dependencies: string[]): boolean {
    return dependencies.every(depId => {
      const status = this.state.stepStatus[depId];
      return status === 'completed';
    });
  }

  /**
   * Get workflow input
   */
  getInput(): Record<string, any> {
    return this.state.input;
  }

  /**
   * Get workflow output
   */
  getOutput(): Record<string, any> {
    return this.state.output;
  }

  /**
   * Get all variables
   */
  getVariables(): Record<string, any> {
    return this.state.variables;
  }

  /**
   * Get loop state
   */
  getLoopState(): any {
    return this.state.loop;
  }

  /**
   * Set loop iteration
   */
  setLoopIteration(iteration: any, index: number): void {
    this.state.loop.iteration = iteration;
    this.state.loop.index = index;
  }

  /**
   * Increment loop iteration count
   */
  incrementLoopIteration(): void {
    this.state.loop.totalIterations = (this.state.loop.totalIterations || 0) + 1;
  }

  /**
   * Clone the context
   */
  clone(): WorkflowContext {
    const cloned = new WorkflowContext(this.workflowId + '-clone', this.state.input);
    cloned.state = JSON.parse(JSON.stringify(this.state));
    return cloned;
  }

  /**
   * Convert to plain object
   */
  toJSON(): Record<string, any> {
    return {
      workflowId: this.workflowId,
      ...this.state,
    };
  }

  /**
   * Helper: get nested path from object
   */
  private getPath(obj: any, parts: string[]): any {
    return parts.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  /**
   * Helper: set nested path on object
   */
  private setPath(obj: any, parts: string[], value: any): void {
    if (parts.length === 0) {
      // Replace entire object (for primitives)
      Object.assign(obj, value);
      return;
    }

    const lastKey = parts.pop()!;
    const target = parts.reduce((o, k) => {
      if (!o[k] || typeof o[k] !== 'object') {
        o[k] = {};
      }
      return o[k];
    }, obj);
    target[lastKey] = value;
  }
}
