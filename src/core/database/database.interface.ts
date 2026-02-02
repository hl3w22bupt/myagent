/**
 * Database Interface
 *
 * Abstract interface for database operations.
 * Implementations can support different backends (PostgreSQL, SQLite, etc.)
 */

import type { TaskStatus, Task, CreateTaskData, Session } from './data-store';
import type { TaskContext, Message, ArtifactIndex, CompressionHistory } from './context-types';

export interface Database {
  /**
   * Initialize database connection
   */
  initialize(): Promise<void>;

  /**
   * Close database connection
   */
  close(): Promise<void>;

  /**
   * Task operations
   */
  createTask(data: CreateTaskData): Promise<Task>;
  getTask(taskId: string): Promise<Task | null>;
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Task>;
  listTasks(filters?: {
    sessionId?: string;
    status?: TaskStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }>;
  deleteTask(taskId: string): Promise<boolean>;

  /**
   * Context operations
   */
  createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext>;
  getContext(taskId: string): Promise<TaskContext | null>;
  saveContext(context: TaskContext): Promise<void>;
  addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext>;

  /**
   * Artifact operations
   */
  addArtifact(artifact: Omit<ArtifactIndex, 'taskId' | 'id'> & { taskId?: string; id?: string }): Promise<void>;
  getArtifacts(taskId: string): Promise<ArtifactIndex[]>;

  /**
   * Compression history operations
   */
  saveCompressionHistory(history: CompressionHistory): Promise<void>;
  getCompressionHistory(taskId: string): Promise<CompressionHistory[]>;

  /**
   * Session operations
   */
  upsertSession(sessionId: string, metadata?: Record<string, any>): Promise<void>;
  getSession(sessionId: string): Promise<Session | null>;
  listSessions(limit?: number, offset?: number): Promise<Session[]>;

  /**
   * Cleanup operations
   */
  cleanupOldData(olderThanDays?: number): Promise<number>;
}
