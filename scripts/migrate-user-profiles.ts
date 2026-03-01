/**
 * 迁移用户画像数据 - 从旧格式迁移到新格式
 *
 * 旧格式（MyEcho 特定）:
 * {
 *   behavior: { totalSessions, activeHours, ... },
 *   responseStyle: { commonPhrases, avgResponseLength, emotionDistribution },
 *   responsePatterns: {}
 * }
 *
 * 新格式（通用）:
 * {
 *   preferences: string[],
 *   habits: string[],
 *   tags: string[],
 *   data: { behavior: ..., responseStyle: ..., responsePatterns: ... },  // 保留旧数据
 *   metadata: { lastUpdated, version }
 * }
 */

import { Pool } from 'pg';

// 从环境变量或使用默认值
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'myagent',
  user: process.env.PG_USER || 'leo',
  // macOS 本地使用 peer 认证，不需要密码
});

/**
 * 迁移单个用户画像
 */
function migrateProfile(oldProfile: any): {
  userId: string;
  preferences: string[];
  habits: string[];
  tags: string[];
  data: Record<string, any>;
  metadata: {
    lastUpdated: Date | string;
    version: number;
  };
} {
  const migrated: any = {
    userId: oldProfile.userId,
    preferences: [] as string[],
    habits: [] as string[],
    tags: [] as string[],
    data: {
      // 保留旧格式数据到 data 字段
      behavior: oldProfile.behavior || {},
      responseStyle: oldProfile.responseStyle || {},
      responsePatterns: oldProfile.responsePatterns || {},
    },
    metadata: {
      lastUpdated: oldProfile.metadata?.lastUpdated || new Date(),
      version: (oldProfile.metadata?.version || 0) + 1,  // 版本升级
    },
  };

  // 从旧数据推断通用标签
  const behavior = oldProfile.behavior || {};

  // 根据 totalSessions 添加标签
  const totalSessions = behavior.totalSessions || 0;
  if (totalSessions >= 10) {
    migrated.tags.push('高活跃');
  } else if (totalSessions >= 5) {
    migrated.tags.push('活跃用户');
  } else if (totalSessions >= 1) {
    migrated.tags.push('新用户');
  }

  // 根据 activeHours 添加习惯
  const activeHours = behavior.activeHours || [];
  if (activeHours.some((h: number) => h >= 22 || h <= 6)) {
    migrated.habits.push('夜间活跃');
  }
  if (activeHours.some((h: number) => h >= 9 && h <= 17)) {
    migrated.habits.push('日间活跃');
  }

  // 根据 avgSessionLength 添加习惯
  const avgLength = behavior.avgSessionLength || 0;
  if (avgLength > 300000) {  // 超过5分钟
    migrated.habits.push('长时间会话');
  }

  // 根据 emotionDistribution 添加偏好
  const emotion = oldProfile.responseStyle?.emotionDistribution || {};
  const emotions = Object.entries(emotion).sort((a, b) => (b[1] as number) - (a[1] as number));
  if (emotions.length > 0 && (emotions[0][1] as number) > 0) {
    const topEmotion = emotions[0][0];
    if (topEmotion === 'happy') migrated.preferences.push('积极乐观');
    if (topEmotion === 'caring') migrated.preferences.push('关怀体贴');
    if (topEmotion === 'gentle') migrated.preferences.push('温柔细腻');
    if (topEmotion === 'playful') migrated.preferences.push('活泼开朗');
  }

  return migrated;
}

/**
 * 执行迁移
 */
export async function migrateUserProfiles(dryRun = true) {
  console.log('开始迁移用户画像...');

  // 获取所有用户
  const result = await pool.query('SELECT user_id, profile FROM users');

  console.log(`找到 ${result.rows.length} 个用户`);

  const migrations: Array<{ userId: string; before: any; after: any }> = [];

  for (const row of result.rows) {
    const userId = row.user_id;
    const oldProfile = row.profile;

    // 检查是否需要迁移（没有 preferences/habits/tags 字段）
    if (oldProfile.preferences !== undefined) {
      console.log(`跳过用户 ${userId} - 已是新格式`);
      continue;
    }

    console.log(`迁移用户 ${userId}...`);
    const newProfile = migrateProfile(oldProfile);

    migrations.push({ userId, before: oldProfile, after: newProfile });

    if (!dryRun) {
      await pool.query(
        'UPDATE users SET profile = $1, updated_at = $2 WHERE user_id = $3',
        [JSON.stringify(newProfile), Date.now(), userId]
      );
      console.log(`  ✓ 已更新用户 ${userId}`);
    } else {
      console.log(`  [预览] 新增偏好: ${newProfile.preferences.join(', ') || '无'}`);
      console.log(`  [预览] 新增习惯: ${newProfile.habits.join(', ') || '无'}`);
      console.log(`  [预览] 新增标签: ${newProfile.tags.join(', ') || '无'}`);
    }
  }

  console.log('\n迁移完成!');
  console.log(`总计处理: ${migrations.length} 个用户`);

  return migrations;
}

// CLI 执行
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (dryRun) {
    console.log('🔍 干跑模式 (使用 --execute 执行实际迁移)\n');
  } else {
    console.log('⚠️  执行模式 - 将修改数据库!\n');
  }

  migrateUserProfiles(dryRun)
    .then(() => {
      console.log('\n✅ 完成');
      return pool.end().then(() => process.exit(0));
    })
    .catch((err) => {
      console.error('❌ 迁移失败:', err);
      pool.end().then(() => process.exit(1));
    });
}
