/**
 * Session Utilities
 *
 * Shared utility functions for session ID and user ID parsing
 */

/**
 * Extract user ID from session ID
 *
 * Session ID format: soul-{soulId}-{userId}
 *
 * @param sessionId - The session ID
 * @param soulId - Optional soul ID (provides more accurate extraction)
 * @returns User ID extracted from session ID
 */
export function extractUserId(sessionId: string, soulId?: string): string {
  // If soulId is provided, use more precise extraction
  if (soulId) {
    const prefix = `soul-${soulId}-`;
    if (sessionId.startsWith(prefix)) {
      return sessionId.substring(prefix.length);
    }
  }

  // Fallback to parsing by splitting
  const parts = sessionId.split('-');
  if (parts.length >= 3 && parts[0] === 'soul') {
    // Remove 'soul-' prefix and soul ID to get user ID
    return parts.slice(2).join('-');
  }

  return sessionId;
}

/**
 * Validate session ID format
 *
 * @param sessionId - The session ID to validate
 * @returns True if valid format
 */
export function isValidSessionId(sessionId: string): boolean {
  return sessionId.startsWith('soul-') && sessionId.split('-').length >= 3;
}
