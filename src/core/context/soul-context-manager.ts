/**
 * Soul Context Manager
 *
 * @deprecated This class is deprecated and will be removed in a future version.
 * Soul Agent now uses the standard task_contexts table instead of soul_contexts.
 * Use ContextManager from './manager' instead.
 *
 * Extends ContextManager with Soul-specific context management
 * Handles user profiles, relationship states, and conversation history for Soul agents
 */

import { ContextManager } from './manager';

export interface UserProfile {
  name?: string;
  age?: number;
  interests?: string[];
  personality?: string;
  preferences?: Record<string, any>;
}

export interface RelationshipState {
  intimacy: number; // 0-100
  lastInteraction?: string;
  chatDays?: number;
  nickname?: string;
  moodHistory?: Array<{ date: string; mood: string }>;
}

export interface SoulContext {
  userProfile: UserProfile;
  recentConversations: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  relationship: RelationshipState;
}

/**
 * SoulContextManager - Manages context for autonomous Soul agents
 *
 * @deprecated Use ContextManager from './manager' instead.
 * Soul Agent now saves conversations to task_contexts table.
 */
export class SoulContextManager extends ContextManager {
  /**
   * Get user profile for a session
   *
   * @deprecated Soul Agent now uses standard user profiles
   */
  async getUserProfile(sessionId: string): Promise<UserProfile> {
    console.warn('[SoulContextManager] getUserProfile is deprecated');
    return {
      name: '用户',
      interests: [],
      preferences: {}
    };
  }

  /**
   * Get relationship state for a session
   *
   * @deprecated Soul Agent now uses standard context metadata
   */
  async getRelationshipState(sessionId: string): Promise<RelationshipState> {
    console.warn('[SoulContextManager] getRelationshipState is deprecated');
    return {
      intimacy: 50,
      chatDays: 0,
      lastInteraction: undefined
    };
  }

  /**
   * Get recent conversations for a session
   *
   * @deprecated Use ContextManager.getContext() to get conversation history from task_contexts
   */
  async getRecentConversations(sessionId: string, limit: number = 10): Promise<Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>> {
    console.warn('[SoulContextManager] getRecentConversations is deprecated');
    return [];
  }

  /**
   * Get complete soul context
   *
   * @deprecated Use ContextManager.getContext() instead
   */
  async getSoulContext(sessionId: string): Promise<SoulContext> {
    console.warn('[SoulContextManager] getSoulContext is deprecated');
    return {
      userProfile: {},
      recentConversations: [],
      relationship: { intimacy: 50 }
    };
  }

  /**
   * Update soul context
   *
   * @deprecated Updates are now handled through standard context operations
   */
  async updateContext(sessionId: string, context: Partial<SoulContext>): Promise<void> {
    console.warn('[SoulContextManager] updateContext is deprecated - no-op');
  }

  /**
   * Update relationship state
   *
   * @deprecated Use standard context updates instead
   */
  async updateRelationshipState(sessionId: string, relationship: Partial<RelationshipState>): Promise<void> {
    console.warn('[SoulContextManager] updateRelationshipState is deprecated - no-op');
  }

  /**
   * Add conversation message
   *
   * @deprecated Soul Agent now saves conversations to task_contexts automatically
   */
  async addConversationMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    console.warn('[SoulContextManager] addConversationMessage is deprecated - no-op');
  }

  /**
   * Extract user ID from session ID
   *
   * @deprecated Internal helper method
   */
  private extractUserId(sessionId: string): string {
    const parts = sessionId.split('-');
    if (parts.length >= 3 && parts[0] === 'soul') {
      return parts.slice(2).join('-');
    }
    return sessionId;
  }
}

// Export singleton instance
export const soulContextManager = new SoulContextManager();
