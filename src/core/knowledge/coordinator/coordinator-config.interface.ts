/**
 * Retrieval Coordinator Configuration
 */

export interface CoordinatorConfig {
  maxConcurrency?: number;
  limitPerSource?: number;
  globalLimit?: number;
  normalizationStrategy?: 'none' | 'min-max';
}
