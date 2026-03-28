/**
 * MyAgent Knowledge Base Setup Script
 *
 * This script sets up the pgvector extension and creates the knowledge table
 * for RAG (Retrieval-Augmented Generation) functionality.
 *
 * Usage:
 *   npm run setup:knowledge-base         # Dry-run (shows what would be done)
 *   npm run setup:knowledge-base -- --execute   # Execute the migration
 *
 * Or run directly:
 *   npx tsx scripts/setup-knowledge-base.ts [--execute]
 */

import { Pool, QueryResult } from 'pg';

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

  // Only include password if it's defined
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
 * Install pgvector extension
 */
async function installPgvectorExtension(pool: Pool): Promise<void> {
  console.log('\n📦 Installing pgvector extension...');

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('   ✓ pgvector extension installed');
  } catch (err) {
    console.error('   ✗ Failed to install pgvector extension:', err);
    throw err;
  }
}

/**
 * Create knowledge table with vector column
 */
async function createKnowledgeTable(pool: Pool): Promise<void> {
  console.log('\n📋 Creating knowledge table...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS knowledge (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(255) NOT NULL,
      collection_name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      embedding vector(1536),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create composite index for tenant + collection lookups
    CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_collection
      ON knowledge(tenant_id, collection_name);

    -- Create unique constraint to prevent duplicates
    CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_unique_content
      ON knowledge(tenant_id, collection_name, content);

    -- Create trigger for updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_knowledge_updated_at ON knowledge;
    CREATE TRIGGER update_knowledge_updated_at
      BEFORE UPDATE ON knowledge
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await pool.query(createTableSQL);
    console.log('   ✓ Knowledge table created');
    console.log('   ✓ Indexes created (tenant+collection, unique constraint)');
    console.log('   ✓ Updated timestamp trigger created');
  } catch (err) {
    console.error('   ✗ Failed to create knowledge table:', err);
    throw err;
  }
}

/**
 * Create vector index for similarity search
 *
 * Note: IVFFlat index requires at least 1000 rows with vectors to be created.
 * This script creates the index structure but it will only be built after data insertion.
 * For small datasets (<1000 rows), sequential scan may be faster.
 */
async function createVectorIndex(pool: Pool): Promise<void> {
  console.log('\n🔍 Setting up vector index...');

  // Check if we have enough data for IVFFlat
  const countResult = await pool.query(
    'SELECT COUNT(*) AS count FROM knowledge WHERE embedding IS NOT NULL'
  );
  const rowCount = parseInt(countResult.rows[0].count);

  console.log(`   Current knowledge entries: ${rowCount}`);

  if (rowCount >= 1000) {
    // Use IVFFlat for larger datasets (faster search, slower build)
    console.log('   Creating IVFFlat index (recommended for 1000+ rows)...');

    const createIndexSQL = `
      -- IVFFlat index for cosine similarity
      CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_ivfflat
        ON knowledge
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = ${Math.sqrt(rowCount).toFixed(0)});
    `;

    try {
      await pool.query(createIndexSQL);
      console.log('   ✓ IVFFlat vector index created');
    } catch (err) {
      console.error('   ✗ Failed to create IVFFlat index:', err);
      throw err;
    }
  } else if (rowCount > 0) {
    console.log('   ⚠ Less than 1000 rows - sequential scan may be faster');
    console.log('   ⚠ Vector index will be created automatically after 1000+ rows');
  } else {
    console.log('   ℹ No data yet - vector index will be created after data insertion');
  }
}

/**
 * Verify installation
 */
async function verifyInstallation(pool: Pool): Promise<void> {
  console.log('\n✅ Verifying installation...');

  try {
    // Check pgvector extension
    const extResult = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (extResult.rows.length > 0) {
      console.log('   ✓ pgvector extension installed');
    } else {
      console.log('   ✗ pgvector extension NOT found');
    }

    // Check knowledge table
    const tableResult = await pool.query(
      "SELECT * FROM information_schema.tables WHERE table_name = 'knowledge'"
    );
    if (tableResult.rows.length > 0) {
      console.log('   ✓ knowledge table exists');

      // Show row count
      const countResult = await pool.query('SELECT COUNT(*) AS count FROM knowledge');
      const count = parseInt(countResult.rows[0].count);
      console.log(`   ℹ Current knowledge entries: ${count}`);
    } else {
      console.log('   ✗ knowledge table NOT found');
    }

    // Show indexes
    const indexResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'knowledge'
      ORDER BY indexname
    `);

    if (indexResult.rows.length > 0) {
      console.log(`   ✓ ${indexResult.rows.length} indexes created:`);
      indexResult.rows.forEach((row: any) => {
        console.log(`     - ${row.indexname}`);
      });
    }
  } catch (err) {
    console.error('   ✗ Verification failed:', err);
  }
}

/**
 * Main setup function
 */
export async function setupKnowledgeBase(dryRun = false): Promise<void> {
  const pool = createPool();

  try {
    console.log('============================================================');
    console.log('  MyAgent Knowledge Base Setup');
    console.log('============================================================');
    console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes will be made)' : 'EXECUTE'}`);
    console.log('============================================================\n');

    if (dryRun) {
      console.log('⚠ This is a DRY-RUN. No actual changes will be made.\n');
      console.log('The following actions would be performed:\n');
      console.log('1. Install pgvector extension');
      console.log('2. Create knowledge table with vector column');
      console.log('3. Create composite index (tenant + collection)');
      console.log('4. Create unique constraint');
      console.log('5. Create updated timestamp trigger');
      console.log('6. Create vector index (if 1000+ rows)\n');
      console.log('To execute, run with --execute flag:\n');
      console.log('  npm run setup:knowledge-base -- --execute\n');
      return;
    }

    // Execute setup
    await installPgvectorExtension(pool);
    await createKnowledgeTable(pool);
    await createVectorIndex(pool);
    await verifyInstallation(pool);

    console.log('\n============================================================');
    console.log('  ✅ Knowledge base setup completed successfully!');
    console.log('============================================================\n');
    console.log('Next steps:');
    console.log('1. Implement KnowledgeBase class (src/core/knowledge/knowledge-base.ts)');
    console.log('2. Integrate knowledge retrieval into Agent.run()');
    console.log('3. Add knowledge to collections using addKnowledge()');
    console.log('4. Test knowledge retrieval with sample queries\n');
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

  setupKnowledgeBase(dryRun)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}
