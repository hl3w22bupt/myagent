/**
 * 清理旧任务脚本
 *
 * 删除数据库中指定天数之前的所有任务（包括所有状态的任务）
 * 外键约束会自动级联删除相关的上下文、消息、artifacts 等
 *
 * 支持数据库: SQLite 和 PostgreSQL
 */

import path from 'path';
import fs from 'fs';

interface CleanupOptions {
  olderThanDays: number;
  dbPath?: string;
  dryRun?: boolean;
  force?: boolean;
}

/**
 * SQLite 清理
 */
async function cleanupSQLite(options: CleanupOptions): Promise<void> {
  const { olderThanDays, dryRun = false } = options;

  const dbPath = path.join(process.cwd(), 'data', 'myagent.db');

  console.log('📦 使用 SQLite 数据库');
  console.log(`   路径: ${dbPath}\n`);

  // 检查数据库文件是否存在
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ 数据库文件不存在: ${dbPath}`);
    return;
  }

  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db: any = new SQL.Database(buffer);

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON');

  // 计算截止时间（毫秒时间戳）
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime);

  console.log(`📅 截止时间: ${cutoffDate.toISOString()}`);
  console.log(`📅 截止时间戳: ${cutoffTime}\n`);

  // 查询将要删除的任务
  const selectStmt = db.prepare(`
    SELECT id, task, status, created_at, session_id
    FROM tasks
    WHERE created_at < ?
    ORDER BY created_at DESC
  `);
  selectStmt.bind([cutoffTime]);

  const tasksToDelete: any[] = [];
  while (selectStmt.step()) {
    const row = selectStmt.getAsObject();
    tasksToDelete.push({
      id: row.id,
      task: row.task,
      status: row.status,
      createdAt: new Date(row.created_at as number),
      sessionId: row.session_id,
    });
  }
  selectStmt.free();

  // 统计信息
  const totalTasks = tasksToDelete.length;
  const statusCounts: Record<string, number> = {};

  tasksToDelete.forEach(task => {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
  });

  // 显示统计信息
  console.log('📊 统计信息:');
  console.log(`   总任务数: ${totalTasks}`);
  if (totalTasks > 0) {
    console.log(`   按状态分组:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     - ${status}: ${count}`);
    });
  }

  if (totalTasks === 0) {
    console.log('\n✅ 没有需要删除的任务');
    db.close();
    return;
  }

  // 显示部分任务示例（最多显示5个）
  console.log('\n📋 将要删除的任务示例 (最多显示5个):');
  tasksToDelete.slice(0, 5).forEach((task, index) => {
    console.log(`   ${index + 1}. [${task.status}] ${task.id}`);
    console.log(`      任务: ${task.task.substring(0, 60)}${task.task.length > 60 ? '...' : ''}`);
    console.log(`      创建时间: ${task.createdAt.toISOString()}`);
    console.log(`      会话ID: ${task.sessionId}`);
  });

  if (tasksToDelete.length > 5) {
    console.log(`   ... 还有 ${tasksToDelete.length - 5} 个任务未显示`);
  }

  // 如果是模拟运行，只显示信息不执行删除
  if (dryRun) {
    console.log('\n⚠️  模拟运行模式 - 不会实际删除任何数据');
    console.log('💡 如需实际删除，请使用 --execute 参数');
    db.close();
    return;
  }

  // 执行删除
  console.log('\n🗑️  开始删除...');

  const deleteStmt = db.prepare('DELETE FROM tasks WHERE created_at < ?');
  deleteStmt.bind([cutoffTime]);
  deleteStmt.step();
  const deletedCount = db.getRowsModified();
  deleteStmt.free();

  console.log(`✅ 删除完成: 共删除 ${deletedCount} 个任务`);

  // 保存数据库
  const data = db.export();
  const saveBuffer = Buffer.from(data);
  fs.writeFileSync(dbPath, saveBuffer);

  console.log(`💾 数据库已保存到: ${dbPath}`);
  console.log('✨ 清理完成!');

  db.close();
}

/**
 * PostgreSQL 清理
 */
async function cleanupPostgreSQL(options: CleanupOptions): Promise<void> {
  const { olderThanDays, dryRun = false } = options;

  // 动态导入 pg
  const { Pool } = await import('pg');

  // 从环境变量读取数据库配置
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ 未找到 DATABASE_URL 环境变量');
    console.error('💡 请先设置 PostgreSQL 连接字符串:');
    console.error('   export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"');
    return;
  }

  console.log('🐘 使用 PostgreSQL 数据库');
  console.log(`   连接: ${connectionString.replace(/:[^:@]+@/, ':****@')}\n`);

  const pool = new Pool({ connectionString });

  try {
    // 计算截止时间（毫秒时间戳）
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffTime);

    console.log(`📅 截止时间: ${cutoffDate.toISOString()}`);
    console.log(`📅 截止时间戳: ${cutoffTime}\n`);

    // 查询将要删除的任务
    const selectResult = await pool.query(
      `SELECT id, task, status, created_at, session_id
       FROM tasks
       WHERE created_at < $1
       ORDER BY created_at DESC`,
      [cutoffTime]
    );

    const tasksToDelete = selectResult.rows.map(row => ({
      id: row.id,
      task: row.task,
      status: row.status,
      createdAt: new Date(typeof row.created_at === 'number' ? row.created_at : parseInt(row.created_at)),
      sessionId: row.session_id,
    }));

    // 统计信息
    const totalTasks = tasksToDelete.length;
    const statusCounts: Record<string, number> = {};

    tasksToDelete.forEach(task => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });

    // 显示统计信息
    console.log('📊 统计信息:');
    console.log(`   总任务数: ${totalTasks}`);
    if (totalTasks > 0) {
      console.log(`   按状态分组:`);
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`     - ${status}: ${count}`);
      });
    }

    if (totalTasks === 0) {
      console.log('\n✅ 没有需要删除的任务');
      return;
    }

    // 显示部分任务示例（最多显示5个）
    console.log('\n📋 将要删除的任务示例 (最多显示5个):');
    tasksToDelete.slice(0, 5).forEach((task, index) => {
      console.log(`   ${index + 1}. [${task.status}] ${task.id}`);
      console.log(`      任务: ${task.task.substring(0, 60)}${task.task.length > 60 ? '...' : ''}`);
      console.log(`      创建时间: ${task.createdAt.toISOString()}`);
      console.log(`      会话ID: ${task.sessionId}`);
    });

    if (tasksToDelete.length > 5) {
      console.log(`   ... 还有 ${tasksToDelete.length - 5} 个任务未显示`);
    }

    // 如果是模拟运行，只显示信息不执行删除
    if (dryRun) {
      console.log('\n⚠️  模拟运行模式 - 不会实际删除任何数据');
      console.log('💡 如需实际删除，请使用 --execute 参数');
      return;
    }

    // 执行删除
    console.log('\n🗑️  开始删除...');

    const deleteResult = await pool.query(
      'DELETE FROM tasks WHERE created_at < $1',
      [cutoffTime]
    );

    console.log(`✅ 删除完成: 共删除 ${deleteResult.rowCount} 个任务`);
    console.log('✨ 清理完成!');
  } finally {
    await pool.end();
  }
}

/**
 * 主函数
 */
async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    olderThanDays: 2, // 默认删除2天前的数据
    dryRun: true, // 默认是模拟运行
  };

  // 解析参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--days' || arg === '-d') {
      const days = parseInt(args[++i]);
      if (isNaN(days) || days < 0) {
        console.error('❌ 无效的天数参数');
        process.exit(1);
      }
      options.olderThanDays = days;
    } else if (arg === '--execute' || arg === '-e') {
      options.dryRun = false;
    } else if (arg === '--force' || arg === '-f') {
      options.dryRun = false;
      options.force = true;
    } else if (arg === '--postgres' || arg === '-p') {
      process.env.DATABASE_BACKEND = 'postgres';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
用法: npm run cleanup [选项]

选项:
  -d, --days <天数>     删除指定天数前的任务 (默认: 2)
  -e, --execute        实际执行删除 (默认: 模拟运行)
  -f, --force          强制删除，跳过确认
  -p, --postgres       使用 PostgreSQL 数据库
  -h, --help          显示帮助信息

环境变量:
  DATABASE_BACKEND     数据库后端类型 (sqlite|postgres)
  DATABASE_URL        PostgreSQL 连接字符串

示例:
  # 模拟运行，查看将要删除的2天前的任务
  npm run cleanup

  # 实际删除2天前的所有任务
  npm run cleanup -- --execute

  # 删除7天前的所有任务
  npm run cleanup -- --days 7 --execute

  # 使用 PostgreSQL 数据库
  npm run cleanup -- --postgres --days 7 --execute

  # 查看将要删除的10天前的任务（不执行删除）
  npm run cleanup -- --days 10
      `);
      process.exit(0);
    } else {
      console.error(`❌ 未知参数: ${arg}`);
      console.error('使用 --help 查看帮助信息');
      process.exit(1);
    }
  }

  console.log('='.repeat(60));
  console.log('旧任务清理脚本');
  console.log('='.repeat(60));
  console.log(`删除天数: ${options.olderThanDays} 天前`);
  console.log(`模式: ${options.dryRun ? '模拟运行 (不会实际删除)' : '实际删除'}`);
  console.log('='.repeat(60));
  console.log();

  // 检测数据库后端
  const backend = process.env.DATABASE_BACKEND || 'sqlite';

  if (backend === 'postgres') {
    await cleanupPostgreSQL(options);
  } else {
    await cleanupSQLite(options);
  }
}

// 执行清理
main().catch(error => {
  console.error('❌ 清理失败:', error);
  process.exit(1);
});
