#!/usr/bin/env tsx
/**
 * PostgreSQL Database Initialization Script
 *
 * This script creates the myagent database and initializes the schema
 * Run with: npx tsx scripts/init-postgres.ts
 */

import { Client } from 'pg';

async function createDatabase() {
  console.log('🔧 Starting PostgreSQL database initialization...\n');

  // First, connect to postgres default database to create myagent
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'leo',
    database: 'postgres', // Connect to default database first
  });

  try {
    console.log('1️⃣  Connecting to PostgreSQL server...');
    await client.connect();
    console.log('   ✅ Connected successfully\n');

    // Check if database exists
    console.log('2️⃣  Checking if myagent database exists...');
    const checkResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'myagent'"
    );

    if (checkResult.rows.length === 0) {
      console.log('   ❌ Database does not exist');
      console.log('   📝 Creating myagent database...');
      await client.query('CREATE DATABASE myagent');
      console.log('   ✅ Database created successfully\n');
    } else {
      console.log('   ✅ Database already exists\n');
    }

    await client.end();

    // Now connect to myagent database and create schema
    console.log('3️⃣  Connecting to myagent database...');
    const myagentClient = new Client({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      user: process.env.PG_USER || 'leo',
      database: 'myagent',
    });

    await myagentClient.connect();
    console.log('   ✅ Connected to myagent\n');

    // Create tables using the schema from postgres-store.ts
    console.log('4️⃣  Creating database tables...');

    // Tasks table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        completed_at BIGINT,
        output TEXT,
        error TEXT,
        execution_time INTEGER,
        metadata JSONB,
        retry_count INTEGER DEFAULT 0,
        is_retry INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        ptc_codes JSONB,
        structured_output JSONB
      )
    `);
    console.log('   ✅ tasks table created');

    // Task contexts table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS task_contexts (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        context TEXT NOT NULL,
        tokens INTEGER,
        created_at BIGINT NOT NULL
      )
    `);
    console.log('   ✅ task_contexts table created');

    // Messages table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);
    console.log('   ✅ messages table created');

    // Artifacts table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);
    console.log('   ✅ artifacts table created');

    // Compression history table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS compression_history (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        original_tokens INTEGER,
        compressed_tokens INTEGER,
        compression_ratio REAL,
        created_at BIGINT NOT NULL
      )
    `);
    console.log('   ✅ compression_history table created');

    // Outputs table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS outputs (
        id SERIAL PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        output TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);
    console.log('   ✅ outputs table created');

    // Sessions table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at BIGINT NOT NULL,
        last_active_at BIGINT NOT NULL,
        metadata JSONB
      )
    `);
    console.log('   ✅ sessions table created');

    // Users table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        profile JSONB NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        last_session_id TEXT
      )
    `);
    console.log('   ✅ users table created');

    // Favorites table
    await myagentClient.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(user_id, task_id)
      )
    `);
    console.log('   ✅ favorites table created');

    // Create indexes
    console.log('\n5️⃣  Creating indexes...');

    try {
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_task_contexts_task_id ON task_contexts(task_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_outputs_task_id ON outputs(task_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_users_last_session ON users(last_session_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)');
      await myagentClient.query('CREATE INDEX IF NOT EXISTS idx_favorites_task_id ON favorites(task_id)');
      console.log('   ✅ Indexes created');
    } catch (err: any) {
      console.log('   ⚠️  Some indexes may already exist:', err.message);
    }

    await myagentClient.end();

    console.log('\n✅ Database initialization completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Database: myagent');
    console.log('   - Tables: 9');
    console.log('   - Host: localhost:5432');
    console.log('\n🚀 You can now start the application with: npm run dev\n');

  } catch (error: any) {
    console.error('\n❌ Error during database initialization:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure PostgreSQL is running:');
    console.error('      brew services start postgresql@18');
    console.error('   2. Check PostgreSQL logs:');
    console.error('      tail -f /usr/local/var/log/postgresql@18/postgresql.log');
    console.error('   3. Verify connection settings in .env\n');

    try {
      await client.end();
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

// Run the script
createDatabase();
