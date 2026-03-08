#!/usr/bin/env tsx
/**
 * Completely reset the myagent database
 *
 * WARNING: This will delete all data!
 */

import { Client } from 'pg';

async function resetDatabase() {
  console.log('🔧 Resetting myagent database...\n');

  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'leo',
    database: 'postgres', // Connect to default database
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Terminate all connections to myagent database
    console.log('🔌 Terminating all connections to myagent database...');
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'myagent'
      AND pid <> pg_backend_pid()
    `);
    console.log('✅ Connections terminated\n');

    // Drop the database
    console.log('🗑️  Dropping myagent database...');
    await client.query('DROP DATABASE IF EXISTS myagent');
    console.log('✅ Database dropped\n');

    // Recreate the database
    console.log('📝 Creating myagent database...');
    await client.query('CREATE DATABASE myagent');
    console.log('✅ Database created\n');

    await client.end();

    console.log('✅ Database reset completed successfully!');
    console.log('\n🚀 You can now start the application with: npm run dev');
    console.log('   The application will automatically create the necessary tables.\n');

  } catch (error: any) {
    console.error('\n❌ Error resetting database:', error.message);
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

resetDatabase();
