/**
 * App-Knowledge Mappings Setup Script
 *
 * Creates the app_knowledge_mappings table for managing
 * relationships between applications and knowledge collections.
 *
 * Usage:
 *   npm run setup:app-knowledge-mappings         # Dry-run
 *   npm run setup:app-knowledge-mappings -- --execute   # Execute
 */

import { Pool } from 'pg';

interface PgConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * Create a database connection pool
 */
function createPool(): Pool {
  const config: PgConfig = {
    host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
    database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
    user: process.env.PG_USER || process.env.DB_USER || 'leo',
  };

  if (process.env.PG_PASSWORD || process.env.DB_PASSWORD) {
    config.password = process.env.PG_PASSWORD || process.env.DB_PASSWORD;
  }

  console.log('🔗 Connecting to PostgreSQL:');
  console.log(`   Host: ${config.host}:${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);

  return new Pool(config);
}

/**
 * Create app_knowledge_mappings table
 */
async function createAppKnowledgeMappingsTable(pool: Pool): Promise<void> {
  console.log('\n📋 Creating app_knowledge_mappings table...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS app_knowledge_mappings (
      id BIGSERIAL PRIMARY KEY,
      app_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      collection_name VARCHAR(255) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),

      CONSTRAINT app_collection_unique UNIQUE(app_id, tenant_id, collection_name),
      CONSTRAINT fk_collection
        FOREIGN KEY (tenant_id, collection_name)
        REFERENCES knowledge(tenant_id, collection_name)
        ON DELETE CASCADE
    );
  `;

  const index1SQL = `
    CREATE INDEX IF NOT EXISTS idx_app_lookup
    ON app_knowledge_mappings(app_id, tenant_id, enabled);
  `;

  const index2SQL = `
    CREATE INDEX IF NOT EXISTS idx_tenant_lookup
    ON app_knowledge_mappings(tenant_id, collection_name);
  `;

  const updateTriggerSQL = `
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
    END;
    $$ language plpgsql;

    CREATE TRIGGER update_app_knowledge_mappings_updated_at
      BEFORE UPDATE ON app_knowledge_mappings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await pool.query(createTableSQL);
    console.log('   ✓ Table created');

    await pool.query(index1SQL);
    console.log('   ✓ Index idx_app_lookup created');

    await pool.query(index2SQL);
    console.log('   ✓ Index idx_tenant_lookup created');

    await pool.query(updateTriggerSQL);
    console.log('   ✓ Update trigger created');
  } catch (err) {
    console.error('   ✗ Failed to create table:', err);
    throw err;
  }
}

/**
 * Verify table creation
 */
async function verifyInstallation(pool: Pool): Promise<void> {
  console.log('\n🔍 Verifying installation...');

  try {
    // Check table exists
    const tableResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'app_knowledge_mappings'
    `);

    if (tableResult.rows.length > 0) {
      console.log('   ✓ app_knowledge_mappings table exists');

      // Show columns
      const columnResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'app_knowledge_mappings'
        ORDER BY ordinal_position
      `);

      if (columnResult.rows.length > 0) {
        console.log(`   ✓ ${columnResult.rows.length} columns created:`);
        columnResult.rows.forEach((row: any) => {
          console.log(`     - ${row.column_name}: ${row.data_type}`);
        });
      }

      // Show indexes
      const indexResult = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'app_knowledge_mappings'
        ORDER BY indexname
      `);

      if (indexResult.rows.length > 0) {
        console.log(`   ✓ ${indexResult.rows.length} indexes created:`);
        indexResult.rows.forEach((row: any) => {
          console.log(`     - ${row.indexname}`);
        });
      }
    } else {
      console.log('   ✗ app_knowledge_mappings table NOT found');
    }
  } catch (err) {
    console.error('   ✗ Verification failed:', err);
  }
}

/**
 * Main setup function
 */
export async function setupAppKnowledgeMappings(dryRun = false): Promise<void> {
  const pool = createPool();

  try {
    console.log('============================================================');
    console.log('  App-Knowledge Mappings Setup');
    console.log('============================================================');
    console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes will be made)' : 'EXECUTE'}`);
    console.log('============================================================\n');

    if (dryRun) {
      console.log('⚠ This is a DRY-RUN. No actual changes will be made.\n');
      console.log('The following actions would be performed:\n');
      console.log('1. Create app_knowledge_mappings table');
      console.log('2. Create indexes (app_lookup, tenant_lookup)');
      console.log('3. Create foreign key constraint to knowledge table');
      console.log('4. Create update trigger\n');
      console.log('To execute, run with --execute flag:\n');
      console.log('  npm run setup:app-knowledge-mappings -- --execute\n');
      return;
    }

    // Execute setup
    await createAppKnowledgeMappingsTable(pool);
    await verifyInstallation(pool);

    console.log('\n============================================================');
    console.log('  ✅ App-Knowledge Mappings setup completed!');
    console.log('============================================================\n');
    console.log('Next steps:');
    console.log('1. Implement app-knowledge-manager.ts');
    console.log('2. Modify agent.ts to auto-retrieve knowledge by app');
    console.log('3. Create API endpoints for knowledge configuration');
    console.log('4. Run init-test-knowledge.ts to create test data\n');
  } catch (err) {
    console.error('\n============================================================');
    console.error('  ❌ Setup failed!');
    console.error('============================================================\n');
    console.error('Error:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * CLI execution
 */
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  setupAppKnowledgeMappings(dryRun)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}
