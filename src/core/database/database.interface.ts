/**
 * Database Interface
 *
 * Abstract interface for database operations.
 * Implementations can support different backends (PostgreSQL, SQLite, etc.)
 */

import type { TaskStatus, Task, CreateTaskData, Session } from './data-store.js';
import type { TaskContext, ArtifactIndex, CompressionHistory, OutputIndex } from './context-types.js';

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
    skills?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }>;
  deleteTask(taskId: string): Promise<boolean>;
  deleteTasks(taskIds: string[]): Promise<number>;
  pinTask(taskId: string): Promise<Task>;      // Pin a task
  unpinTask(taskId: string): Promise<Task>;    // Unpin a task
  listPinnedTasks(): Promise<Task[]>;          // List all pinned tasks

  /**
   * Context operations
   */
  createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext>;
  getContext(taskId: string): Promise<TaskContext | null>;
  saveContext(context: TaskContext): Promise<void>;

  /**
   * Artifact operations
   */
  addArtifact(artifact: Omit<ArtifactIndex, 'taskId' | 'id'> & { taskId?: string; id?: string }): Promise<void>;
  updateArtifact(artifactId: string, updates: Partial<Omit<ArtifactIndex, 'id' | 'taskId'>>): Promise<void>;
  getArtifacts(taskId: string): Promise<ArtifactIndex[]>;

  /**
   * Output operations - Track execution outputs across multiple rounds
   */
  addOutput(output: Omit<OutputIndex, 'id'> & { id?: string }): Promise<void>;
  getOutputs(taskId: string): Promise<OutputIndex[]>;
  deleteOutputs(taskId: string): Promise<number>;

  /**
   * Favorite operations
   */
  addFavorite(favorite: {
    artifactId: string;
    taskId: string;
  }): Promise<string | null>;  // Returns favoriteId or existing favoriteId
  removeFavorite(favoriteId: string): Promise<boolean>;
  getFavorite(favoriteId: string): Promise<any | null>;
  getFavoriteByArtifactId(artifactId: string): Promise<any | null>;
  isFavorite(artifactId: string): Promise<boolean>;
  getFavorites(options: {
    page: number;
    limit: number;
    type?: string;
  }): Promise<{
    favorites: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

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
