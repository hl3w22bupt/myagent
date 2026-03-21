/**
 * Execution Constants
 *
 * Constants related to Soul Agent execution
 */

/**
 * Maximum length of LLM decision to store in execution history
 */
export const MAX_DECISION_LENGTH = 500;

/**
 * Default task name for Soul execution
 */
export const DEFAULT_TASK_NAME = 'Soul execution';

/**
 * Execution status enumeration
 */
export enum ExecutionStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Hibernate = 'hibernated'
}
