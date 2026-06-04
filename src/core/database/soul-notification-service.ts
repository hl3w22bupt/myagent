/**
 * Soul Notification Service
 *
 * Data access layer for Soul agent push notifications
 * Manages notification lifecycle: create, send, track delivery
 */

import { PostgresDataStore } from './postgres-store.js';

// Global store instance
let postgresStore: PostgresDataStore | null = null;

/**
 * Get or create PostgresDataStore instance
 */
function getPostgresStore(): PostgresDataStore {
  if (!postgresStore) {
    postgresStore = new PostgresDataStore();
  }
  return postgresStore;
}

/**
 * Notification data structure
 */
export interface SoulNotification {
  id: string;
  sessionId: string;
  soulId: string;
  userId: string;
  title: string;
  body: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Soul Notification Data Service
 *
 * Manages soul_notifications table
 */
export class SoulNotificationDataService {
  /**
   * Create notification
   *
   * @param sessionId - Session ID
   * @param soulId - Soul ID
   * @param userId - User ID
   * @param title - Notification title
   * @param body - Notification body
   * @param urgency - Urgency level
   * @returns Created notification
   */
  async createNotification(
    sessionId: string,
    soulId: string,
    userId: string,
    title: string,
    body: string,
    urgency: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<SoulNotification> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const result = await client.query(`
        INSERT INTO soul_notifications (id, session_id, soul_id, user_id, title, body, urgency, status, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', '{}')
        RETURNING *
      `, [id, sessionId, soulId, userId, title, body, urgency]);

      const row = result.rows[0];

      console.log(`[SoulNotificationDataService] Created notification: ${id} for user ${userId}`);

      return {
        id: row.id,
        sessionId: row.session_id,
        soulId: row.soul_id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        urgency: row.urgency,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        errorMessage: row.error_message,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error: any) {
      console.error(`[SoulNotificationDataService] Failed to create notification: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get notification by ID
   *
   * @param notificationId - Notification ID
   * @returns Notification or null if not found
   */
  async getNotification(notificationId: string): Promise<SoulNotification | null> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT * FROM soul_notifications WHERE id = $1
      `, [notificationId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        id: row.id,
        sessionId: row.session_id,
        soulId: row.soul_id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        urgency: row.urgency,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        errorMessage: row.error_message,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error: any) {
      console.error(`[SoulNotificationDataService] Failed to get notification: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pending notifications for user
   *
   * @param userId - User ID
   * @returns Array of pending notifications
   */
  async getPendingNotifications(userId: string): Promise<SoulNotification[]> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT * FROM soul_notifications
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
      `, [userId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        soulId: row.soul_id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        urgency: row.urgency,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        errorMessage: row.error_message,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error: any) {
      console.error(`[SoulNotificationDataService] Failed to get pending notifications: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update notification status
   *
   * @param notificationId - Notification ID
   * @param status - New status
   * @param errorMessage - Error message if failed
   */
  async updateNotificationStatus(
    notificationId: string,
    status: 'sent' | 'delivered' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const timestamp = status === 'sent' ? 'sent_at' : status === 'delivered' ? 'delivered_at' : null;

      let query = `
        UPDATE soul_notifications
        SET status = $1
      `;

      const params: any[] = [status];

      if (timestamp) {
        query += `, ${timestamp} = CURRENT_TIMESTAMP`;
      }

      if (errorMessage) {
        query += `, error_message = $2`;
        params.push(errorMessage);
      }

      query += ` WHERE id = $${params.length + 1}`;
      params.push(notificationId);

      await client.query(query, params);

      console.log(`[SoulNotificationDataService] Updated notification status: ${notificationId} -> ${status}`);
    } catch (error: any) {
      console.error(`[SoulNotificationDataService] Failed to update notification status: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recent notifications for session
   *
   * @param sessionId - Session ID
   * @param limit - Maximum number of notifications to return
   * @returns Recent notifications
   */
  async getRecentNotifications(sessionId: string, limit: number = 10): Promise<SoulNotification[]> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT * FROM soul_notifications
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [sessionId, limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        soulId: row.soul_id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        urgency: row.urgency,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        errorMessage: row.error_message,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error: any) {
      console.error(`[SoulNotificationDataService] Failed to get recent notifications: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const soulNotificationDataService = new SoulNotificationDataService();
