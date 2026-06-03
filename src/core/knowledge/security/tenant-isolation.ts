/**
 * Tenant Isolation Manager
 *
 * Ensures that tenants can only access their own knowledge collections.
 * Prevents unauthorized cross-tenant data access.
 */

import { Pool } from 'pg';
import { validateCollectionName, validateAppId } from './collection-validator.js';

let pool: Pool | null = null;

/**
 * Get database pool
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
 * Access control entry
 */
export interface AccessControlEntry {
  appId: string;
  collectionName: string;
  hasAccess: boolean;
  reason?: string;
}

/**
 * Check if an app has access to a specific knowledge collection
 *
 * @param appId - Application ID (tenant)
 * @param collectionName - Collection name
 * @returns True if access is granted
 */
export async function checkCollectionAccess(
  appId: string,
  collectionName: string
): Promise<boolean> {
  // Validate inputs
  const appValidation = validateAppId(appId);
  if (!appValidation.valid) {
    return false;
  }

  const collectionValidation = validateCollectionName(collectionName);
  if (!collectionValidation.valid) {
    return false;
  }

  const pool = getPool();

  try {
    // Check if mapping exists and is enabled
    const query = `
      SELECT enabled
      FROM app_knowledge_mappings
      WHERE app_id = $1
        AND table_name = $2
    `;

    const result = await pool.query(query, [appId, collectionName]);

    // Access granted if mapping exists and is enabled
    return result.rows.length > 0 && result.rows[0].enabled === true;
  } catch (error) {
    console.error('[TenantIsolation] Failed to check collection access:', error);
    return false; // Fail closed: deny access on error
  }
}

/**
 * Get all collections accessible to an app
 *
 * @param appId - Application ID (tenant)
 * @returns List of accessible collection names
 */
export async function getAccessibleCollections(appId: string): Promise<string[]> {
  const validation = validateAppId(appId);
  if (!validation.valid) {
    return [];
  }

  const pool = getPool();

  try {
    const query = `
      SELECT table_name
      FROM app_knowledge_mappings
      WHERE app_id = $1
        AND enabled = TRUE
      ORDER BY priority ASC, table_name ASC
    `;

    const result = await pool.query(query, [appId]);
    return result.rows.map((row: any) => row.table_name);
  } catch (error) {
    console.error('[TenantIsolation] Failed to get accessible collections:', error);
    return [];
  }
}

/**
 * Check batch collection access
 *
 * @param appId - Application ID (tenant)
 * @param collectionNames - Array of collection names to check
 * @returns Array of access control entries
 */
export async function checkBatchCollectionAccess(
  appId: string,
  collectionNames: string[]
): Promise<AccessControlEntry[]> {
  const results: AccessControlEntry[] = [];

  for (const collectionName of collectionNames) {
    try {
      const hasAccess = await checkCollectionAccess(appId, collectionName);

      results.push({
        appId,
        collectionName,
        hasAccess,
        reason: hasAccess ? undefined : 'Collection not mapped or not enabled',
      });
    } catch (error: any) {
      results.push({
        appId,
        collectionName,
        hasAccess: false,
        reason: error.message,
      });
    }
  }

  return results;
}

/**
 * Grant access to a collection for an app
 *
 * @param appId - Application ID (tenant)
 * @param collectionName - Collection name
 * @param config - Optional configuration (threshold, priority, etc.)
 * @returns True if access was granted
 */
export async function grantCollectionAccess(
  appId: string,
  collectionName: string,
  config: {
    contentField?: string;
    embeddingField?: string;
    threshold?: number;
    enabled?: boolean;
    priority?: number;
  } = {}
): Promise<boolean> {
  const { addAppKnowledgeCollection } = await import('../app-knowledge-manager');

  try {
    await addAppKnowledgeCollection(
      appId,
      collectionName,
      config.contentField || 'content',
      config.embeddingField || 'embedding',
      config.threshold || 0.7,
      config.enabled !== false,
      config.priority || 0
    );

    return true;
  } catch (error) {
    console.error('[TenantIsolation] Failed to grant collection access:', error);
    return false;
  }
}

/**
 * Revoke access to a collection for an app
 *
 * @param appId - Application ID (tenant)
 * @param collectionName - Collection name
 * @returns True if access was revoked
 */
export async function revokeCollectionAccess(
  appId: string,
  collectionName: string
): Promise<boolean> {
  const { removeAppKnowledgeCollection } = await import('../app-knowledge-manager');

  try {
    await removeAppKnowledgeCollection(appId, collectionName);
    return true;
  } catch (error) {
    console.error('[TenantIsolation] Failed to revoke collection access:', error);
    return false;
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
