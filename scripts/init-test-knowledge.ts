/**
 * Initialize test knowledge and app-knowledge mappings
 *
 * This script creates sample knowledge entries and configures
 * app-knowledge associations for testing.
 *
 * Usage:
 *   npm run init:test-knowledge
 */

import { Pool } from 'pg';
import { KnowledgeBase } from '../src/core/knowledge/knowledge-base.js';
import { addAppKnowledgeCollection } from '../src/core/knowledge/app-knowledge-manager.js';

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

  console.log('🔗 Connecting to PostgreSQL...');
  return new Pool(config);
}

/**
 * Create sample knowledge entries
 */
async function createSampleKnowledge(knowledgeBase: KnowledgeBase): Promise<void> {
  console.log('\n📚 Creating sample knowledge entries...');

  const tenantId = 'test-session-123';

  // Collection 1: Python Documentation
  console.log('\n  Collection: python-docs');
  await knowledgeBase.addKnowledge(
    tenantId,
    'python-docs',
    'Python 是一种高级编程语言，具有简洁的语法和强大的功能。',
    { source: 'intro', category: 'language' }
  );

  await knowledgeBase.addKnowledge(
    tenantId,
    'python-docs',
    'Python 中的列表是可变的序列类型，支持添加、删除和修改元素。',
    { source: 'data-types', category: 'list' }
  );

  await knowledgeBase.addKnowledge(
    tenantId,
    'python-docs',
    'Python 的字典是无序的键值对集合，通过键来访问对应的值。',
    { source: 'data-types', category: 'dict' }
  );

  // Collection 2: Product Documentation
  console.log('  Collection: product-docs');
  await knowledgeBase.addKnowledge(
    tenantId,
    'product-docs',
    '用户可以通过点击"忘记密码"链接来重置账户密码。',
    { source: 'user-guide', category: 'account' }
  );

  await knowledgeBase.addKnowledge(
    tenantId,
    'product-docs',
    '系统支持通过邮箱或手机号进行用户注册和登录。',
    { source: 'authentication', category: 'account' }
  );

  await knowledgeBase.addKnowledge(
    tenantId,
    'product-docs',
    '会员用户可以享受 8 折优惠，并且有专属客服支持。',
    { source: 'pricing', category: 'membership' }
  );

  // Collection 3: Support FAQ
  console.log('  Collection: support-faq');
  await knowledgeBase.addKnowledge(
    tenantId,
    'support-faq',
    '如果遇到登录问题，请先清除浏览器缓存和 Cookie。',
    { source: 'troubleshooting', category: 'login' }
  );

  await knowledgeBase.addKnowledge(
    tenantId,
    'support-faq',
    '系统维护时间是每周日凌晨 2:00-4:00，届时服务将暂停。',
    { source: 'maintenance', category: 'system' }
  );

  console.log(`  ✓ Created 8 knowledge entries across 3 collections`);
}

/**
 * Configure app-knowledge mappings
 */
async function configureAppKnowledge(tenantId: string): Promise<void> {
  console.log('\n🔗 Configuring app-knowledge mappings...');

  // Configure for 'myecho' app
  console.log('  App: myecho');
  await addAppKnowledgeCollection(tenantId, 'myecho', 'python-docs', true, 0);
  await addAppKnowledgeCollection(tenantId, 'myecho', 'product-docs', true, 1);
  await addAppKnowledgeCollection(tenantId, 'myecho', 'support-faq', true, 2);

  console.log('  ✓ Configured 3 collections for myecho app');
}

/**
 * Verify setup
 */
async function verifySetup(pool: Pool, tenantId: string): Promise<void> {
  console.log('\n🔍 Verifying setup...');

  // Check knowledge entries
  const knowledgeResult = await pool.query(
    'SELECT collection_name, COUNT(*) as count FROM knowledge WHERE tenant_id = $1 GROUP BY collection_name',
    [tenantId]
  );

  console.log('  Knowledge entries:');
  knowledgeResult.rows.forEach((row: any) => {
    console.log(`    - ${row.collection_name}: ${row.count} entries`);
  });

  // Check app-knowledge mappings
  const mappingResult = await pool.query(
    'SELECT app_id, collection_name, enabled, priority FROM app_knowledge_mappings WHERE tenant_id = $1 ORDER BY app_id, priority',
    [tenantId]
  );

  console.log('  App-knowledge mappings:');
  mappingResult.rows.forEach((row: any) => {
    console.log(`    - ${row.app_id} → ${row.collection_name} (enabled: ${row.enabled}, priority: ${row.priority})`);
  });
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  const pool = createPool();

  try {
    console.log('============================================================');
    console.log('  Initialize Test Knowledge & App Mappings');
    console.log('============================================================');

    const tenantId = 'test-session-123';

    // Initialize KnowledgeBase
    const knowledgeBase = new KnowledgeBase({
      db: {
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
        database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
        user: process.env.PG_USER || process.env.DB_USER || 'leo',
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
      },
      apiKey: process.env.OPENAI_API_KEY || '',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
    });

    // Create sample knowledge
    await createSampleKnowledge(knowledgeBase);

    // Configure app-knowledge mappings
    await configureAppKnowledge(tenantId);

    // Verify setup
    await verifySetup(pool, tenantId);

    console.log('\n============================================================');
    console.log('  ✅ Test data initialization completed!');
    console.log('============================================================\n');
    console.log('Test scenarios:');
    console.log(`1. Test with app: myecho`);
    console.log(`   curl -X POST http://localhost:3000/agent/execute \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"task": "如何重置密码？", "app": "myecho", "sessionId": "${tenantId}'}'`);
    console.log('');
    console.log(`2. Test with Python knowledge:`);
    console.log(`   curl -X POST http://localhost:3000/agent/execute \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"task": "Python 的列表有什么特点？", "app": "myecho", "sessionId": "${tenantId}'}'`);
    console.log('');

  } catch (err) {
    console.error('\n❌ Initialization failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute if run directly
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}
