/**
 * Date Utilities
 *
 * Shared utility functions for date/time handling
 */

/**
 * Create a unique execution ID
 *
 * @param sessionId - Session identifier
 * @returns Unique execution ID
 */
export function createExecutionId(sessionId: string): string {
  return `exec-${sessionId}-${Date.now()}`;
}

/**
 * Calculate duration between two dates
 *
 * @param startedAt - Start time
 * @param completedAt - Completion time
 * @returns Duration in milliseconds
 */
export function calculateDuration(startedAt: Date, completedAt: Date): number {
  return completedAt.getTime() - startedAt.getTime();
}

/**
 * Format timestamp for display
 *
 * @param timestamp - Timestamp to format
 * @returns Formatted string
 */
export function formatTimestamp(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toLocaleString();
}
