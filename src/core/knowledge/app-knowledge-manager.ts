/**
 * App-Knowledge Manager
 *
 * Manages relationships between applications and knowledge collections.
 * Allows apps to be configured with multiple knowledge bases for RAG.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Initialize the database pool
 */
function getPool(): Pool {
  if (!pool) {
    const config = {
      host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
      database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
      user: process.env.PG_USER || process.env.DB_USER || 'leo',
    };

    if (process.env.PG_PASSWORD || process.env.DB_PASSWORD) {
      (config as any).password = process.env.PG_PASSWORD || process.env.DB_PASSWORD;
    }

    pool = new Pool(config);
  }
  return pool;
}

/**
 * App-Knowledge Mapping interface
 */
export interface AppKnowledgeMapping {
  app_id: string;
  collection_name: string;
  enabled: boolean;
  priority: number;
}

/**
 * Get all enabled knowledge collections for an app
 *
 * @param appId - Application identifier
 * @returns List of knowledge collection mappings
 */
export async function getAppKnowledgeCollections(
  appId: string
): Promise<AppKnowledgeMapping[]> {
  const pool = getPool();

  const query = `
    SELECT
      app_id,
      collection_name,
      enabled,
      priority
    FROM app_knowledge_mappings
    WHERE app_id = $1
      AND enabled = TRUE
    ORDER BY priority ASC, collection_name ASC
  `;

  try {
    const result = await pool.query(query, [appId]);
    return result.rows;
  } catch (error) {
    console.error(`[AppKnowledgeManager] Failed to get collections for app ${appId}:`, error);
    throw error;
  }
}

/**
 * Add a knowledge collection to an app
 *
 * @param appId - Application identifier
 * @param collectionName - Knowledge collection name
 * @param enabled - Whether the collection is enabled
 * @param priority - Retrieval priority (lower = higher priority)
 * @returns The created mapping
 */
export async function addAppKnowledgeCollection(
  appId: string,
  collectionName: string,
  enabled: boolean = true,
  priority: number = 0
): Promise<AppKnowledgeMapping> {
  const pool = getPool();

  const query = `
    INSERT INTO app_knowledge_mappings (app_id, collection_name, enabled, priority)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (app_id, collection_name)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      priority = EXCLUDED.priority,
      updated_at = NOW()
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [appId, collectionName, enabled, priority]);
    console.log(`[AppKnowledgeManager] Added collection ${collectionName} to app ${appId}`);
    return result.rows[0];
  } catch (error) {
    console.error(`[AppKnowledgeManager] Failed to add collection ${collectionName} to app ${appId}:`, error);
    throw error;
  }
}

/**
 * Remove a knowledge collection from an app
 *
 * @param appId - Application identifier
 * @param collectionName - Knowledge collection name
 * @returns True if removed, false if not found
 */
export async function removeAppKnowledgeCollection(
  appId: string,
  collectionName: string
): Promise<boolean> {
  const pool = getPool();

  const query = `
    DELETE FROM app_knowledge_mappings
    WHERE app_id = $1
      AND collection_name = $2
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [appId, collectionName]);
    const removed = (result.rowCount ?? 0) > 0;
    if (removed) {
      console.log(`[AppKnowledgeManager] Removed collection ${collectionName} from app ${appId}`);
    }
    return removed;
  } catch (error) {
    console.error(`[AppKnowledgeManager] Failed to remove collection ${collectionName} from app ${appId}:`, error);
    throw error;
  }
}

/**
 * Batch configure knowledge collections for an app
 *
 * @param appId - Application identifier
 * @param collections - Array of collection configurations
 * @returns Array of created/updated mappings
 */
export async function batchConfigureAppKnowledgeCollections(
  appId: string,
  collections: Array<{ collectionName: string; enabled?: boolean; priority?: number }>
): Promise<AppKnowledgeMapping[]> {
  const results: AppKnowledgeMapping[] = [];

  for (const config of collections) {
    const mapping = await addAppKnowledgeCollection(
      appId,
      config.collectionName,
      config.enabled ?? true,
      config.priority ?? 0
    );
    results.push(mapping);
  }

  console.log(`[AppKnowledgeManager] Batch configured ${collections.length} collections for app ${appId}`);
  return results;
}

/**
 * Get all apps that use a specific knowledge collection
 *
 * @param collectionName - Knowledge collection name
 * @returns List of app IDs using this collection
 */
export async function getAppsForKnowledgeCollection(
  collectionName: string
): Promise<string[]> {
  const pool = getPool();

  const query = `
    SELECT DISTINCT app_id
    FROM app_knowledge_mappings
    WHERE collection_name = $1
      AND enabled = TRUE
    ORDER BY app_id
  `;

  try {
    const result = await pool.query(query, [collectionName]);
    return result.rows.map((row: any) => row.app_id);
  } catch (error) {
    console.error(`[AppKnowledgeManager] Failed to get apps for collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Close the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
