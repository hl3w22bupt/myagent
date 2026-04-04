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
  table_name: string;
  content_field: string;
  embedding_field: string;
  threshold: number;
  embedding_dimensions?: number;
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
      table_name,
      content_field,
      embedding_field,
      threshold,
      embedding_dimensions,
      enabled,
      priority
    FROM app_knowledge_mappings
    WHERE app_id = $1
      AND enabled = TRUE
    ORDER BY priority ASC, table_name ASC
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
 * @param collectionName - Knowledge collection name (table name)
 * @param contentField - Content field name (default: 'content')
 * @param embeddingField - Embedding field name (default: 'embedding')
 * @param threshold - Similarity threshold (default: 0.7)
 * @param enabled - Whether the collection is enabled
 * @param priority - Retrieval priority (lower = higher priority)
 * @returns The created mapping
 */
export async function addAppKnowledgeCollection(
  appId: string,
  collectionName: string,
  contentField: string = 'content',
  embeddingField: string = 'embedding',
  threshold: number = 0.7,
  enabled: boolean = true,
  priority: number = 0
): Promise<AppKnowledgeMapping> {
  const pool = getPool();

  // ⭐ Auto-detect embedding dimensions when adding new collection
  let embeddingDimensions: number | null = null;
  const dimensions = await detectTableDimensions(collectionName, embeddingField);
  if (dimensions !== null) {
    embeddingDimensions = dimensions;
  }

  const query = `
    INSERT INTO app_knowledge_mappings (app_id, table_name, content_field, embedding_field, threshold, embedding_dimensions, enabled, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (app_id, table_name)
    DO UPDATE SET
      content_field = EXCLUDED.content_field,
      embedding_field = EXCLUDED.embedding_field,
      threshold = EXCLUDED.threshold,
      embedding_dimensions = EXCLUDED.embedding_dimensions,
      enabled = EXCLUDED.enabled,
      priority = EXCLUDED.priority,
      updated_at = NOW()
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [
      appId,
      collectionName,
      contentField,
      embeddingField,
      threshold,
      embeddingDimensions,
      enabled,
      priority
    ]);
    console.log(`[AppKnowledgeManager] Added collection ${collectionName} to app ${appId} (dimensions: ${embeddingDimensions})`);
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
      AND table_name = $2
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
  collections: Array<{
    collectionName: string;
    contentField?: string;
    embeddingField?: string;
    threshold?: number;
    enabled?: boolean;
    priority?: number;
  }>
): Promise<AppKnowledgeMapping[]> {
  const results: AppKnowledgeMapping[] = [];

  for (const config of collections) {
    const mapping = await addAppKnowledgeCollection(
      appId,
      config.collectionName,
      config.contentField ?? 'content',
      config.embeddingField ?? 'embedding',
      config.threshold ?? 0.7,
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
    WHERE table_name = $1
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
 * Detect embedding dimensions for a table
 *
 * @param tableName - Table name to check
 * @param embeddingField - Embedding field name (default: 'embedding')
 * @returns Detected dimensions or null if failed
 */
export async function detectTableDimensions(
  tableName: string,
  embeddingField: string = 'embedding'
): Promise<number | null> {
  const pool = getPool();

  // Validate and sanitize table/column names
  // Allow letters, numbers, underscore, hyphen (but not starting with hyphen to avoid SQL injection)
  const isValidName = (name: string) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
  if (!isValidName(tableName) || !isValidName(embeddingField)) {
    console.warn(`[AppKnowledgeManager] Invalid table or column name: ${tableName}.${embeddingField}`);
    return null;
  }

  // Use double quotes to safely quote identifiers (handles special characters like hyphens)
  const query = `
    SELECT "${embeddingField}"
    FROM "${tableName}"
    WHERE "${embeddingField}" IS NOT NULL
    LIMIT 1
  `;

  try {
    const result = await pool.query(query);
    if (result.rows.length === 0) {
      console.warn(`[AppKnowledgeManager] No vectors found in ${tableName}.${embeddingField}`);
      return null;
    }

    const vectorValue = result.rows[0][embeddingField];

    // Parse vector dimensions
    let dimensions: number;
    if (typeof vectorValue === 'string') {
      // Format: "[0.1,0.2,0.3,...]" or "0.1,0.2,0.3,..."
      const cleanStr = vectorValue.replace(/^\[|\]$/g, '');
      dimensions = cleanStr.split(',').filter(s => s.trim().length > 0).length;
    } else if (Array.isArray(vectorValue)) {
      dimensions = vectorValue.length;
    } else {
      console.warn(`[AppKnowledgeManager] Unknown vector format in ${tableName}.${embeddingField}`);
      return null;
    }

    console.log(`[AppKnowledgeManager] Detected dimensions for ${tableName}.${embeddingField}: ${dimensions}`);
    return dimensions;
  } catch (error) {
    console.error(`[AppKnowledgeManager] Failed to detect dimensions for ${tableName}:`, error);
    return null;
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
