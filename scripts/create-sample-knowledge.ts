/**
 * Create sample knowledge entries without embeddings
 *
 * This script creates sample knowledge data in the database.
 * Note: This creates entries WITHOUT embeddings (requires API key for embeddings)
 */

import { Pool } from 'pg';

interface PgConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

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

  return new Pool(config);
}

async function createSampleKnowledge() {
  const pool = createPool();

  try {
    console.log('============================================================');
    console.log('  Creating Sample Knowledge Data');
    console.log('============================================================\n');

    const tenantId = 'session-123';

    // Sample knowledge entries
    const samples = [
      {
        collection: 'product-docs',
        content: '用户可以通过点击"忘记密码"链接来重置账户密码。',
        metadata: { source: 'user-guide', category: 'account', lang: 'zh' }
      },
      {
        collection: 'product-docs',
        content: '系统支持通过邮箱或手机号进行用户注册和登录。',
        metadata: { source: 'authentication', category: 'account', lang: 'zh' }
      },
      {
        collection: 'product-docs',
        content: '会员用户可以享受 8 折优惠，并且有专属客服支持。',
        metadata: { source: 'pricing', category: 'membership', lang: 'zh' }
      },
      {
        collection: 'support-faq',
        content: '如果遇到登录问题，请先清除浏览器缓存和 Cookie。',
        metadata: { source: 'troubleshooting', category: 'login', lang: 'zh' }
      },
      {
        collection: 'support-faq',
        content: '系统维护时间是每周日凌晨 2:00-4:00，届时服务将暂停。',
        metadata: { source: 'maintenance', category: 'system', lang: 'zh' }
      },
      {
        collection: 'python-docs',
        content: 'Python 是一种高级编程语言，具有简洁的语法和强大的功能。',
        metadata: { source: 'intro', category: 'language', lang: 'zh' }
      },
      {
        collection: 'python-docs',
        content: 'Python 中的列表是可变的序列类型，支持添加、删除和修改元素。',
        metadata: { source: 'data-types', category: 'list', lang: 'zh' }
      },
      {
        collection: 'python-docs',
        content: 'Python 的字典是无序的键值对集合，通过键来访问对应的值。',
        metadata: { source: 'data-types', category: 'dict', lang: 'zh' }
      }
    ];

    console.log(`📝 Inserting ${samples.length} sample knowledge entries...\n`);

    for (const sample of samples) {
      const query = `
        INSERT INTO knowledge (tenant_id, collection_name, content, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, collection_name, content)
        DO NOTHING
      `;

      try {
        await pool.query(query, [
          tenantId,
          sample.collection,
          sample.content,
          JSON.stringify(sample.metadata)
        ]);
        console.log(`  ✓ ${sample.collection}: ${sample.content.substring(0, 40)}...`);
      } catch (err) {
        console.error(`  ✗ Failed to insert: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Verify insertion
    console.log('\n🔍 Verifying data...');
    const result = await pool.query(
      `SELECT collection_name, COUNT(*) as count
       FROM knowledge
       WHERE tenant_id = $1
       GROUP BY collection_name
       ORDER BY collection_name`,
      [tenantId]
    );

    console.log('\n  Knowledge collections created:');
    result.rows.forEach((row: any) => {
      console.log(`    - ${row.collection_name}: ${row.count} entries`);
    });

    console.log('\n============================================================');
    console.log('  ✅ Sample knowledge data created successfully!');
    console.log('============================================================\n');
    console.log('Next steps:');
    console.log('1. Visit http://localhost:3000/knowledge');
    console.log('2. Use appId: myecho, tenantId: session-123');
    console.log('3. Add knowledge collections using the UI\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute
createSampleKnowledge()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
