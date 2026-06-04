/**
 * UserProfileAccumulatorHook - 通用用户画像累积 Hook
 *
 * 职责:
 * 1. preExec: 从 users 表加载 userId 的 userProfile，注入到 workingMemory
 * 2. postExec: 提取本次会话特征，累积通用字段到用户画像
 *
 * 通用逻辑:
 * - preferences: 根据会话特征累积用户偏好
 * - habits: 根据会话模式累积用户习惯
 * - tags: 根据统计数据添加用户标签
 *
 * 注意: MyEcho 特定逻辑（情绪分析、回复风格等）应由 MyEcho 后端处理。
 */

import { BaseTaskHook } from './base.js';
import type { TaskContext } from './types.js';
import { getDataStore, type UserProfile } from '../../database/data-store.js';

/**
 * 会话特征提取结果（通用）
 */
interface GenericSessionFeatures {
  duration: number;
  task: string;
  status: string;
  timestamp: Date;
  responseLength: number;
  totalSessions: number; // 从 data.behavior.totalSessions 读取（向后兼容）
}

/**
 * 通用用户画像累积 Hook
 */
export class UserProfileAccumulatorHook extends BaseTaskHook {
  constructor() {
    super();
  }

  /**
   * 任务执行前：加载用户画像并注入到 workingMemory
   */
  async preExec(context: TaskContext): Promise<void> {
    const { metadata } = context;

    // 获取 userId (支持从 metadata 或 metadata.userId 获取)
    const userId = (metadata as any).userId || metadata.userId;

    if (!userId) {
      return; // 没有 userId，跳过
    }

    try {
      const store = getDataStore();

      // 确保 store 已初始化
      await store.initialize();

      // 加载或创建用户
      let user = await store.getUser(userId);
      if (!user) {
        user = await store.createUser(userId);
        console.log('[UserProfileAccumulatorHook] Created new user', { userId });
      }

      // 确保 context 存在
      if (!context.context) {
        (context as any).context = {
          taskId: context.taskId,
          sessionId: context.sessionId,
          conversationRounds: [],
          summary: null,
          artifactIndex: [],
          workingMemory: {},
          metadata: {},
        };
      }

      // 注入用户画像到 workingMemory
      if (context.context) {
        context.context.workingMemory.userProfile = user.profile;
        // 记录会话开始时间用于统计
        context.context.workingMemory._sessionStartTime = Date.now();
      }

      console.log('[UserProfileAccumulatorHook] Loaded user profile', {
        userId,
        profileVersion: user.profile.metadata.version,
        preferences: user.profile.preferences?.length || 0,
        habits: user.profile.habits?.length || 0,
        tags: user.profile.tags?.length || 0,
      });
    } catch (error: any) {
      console.error('[UserProfileAccumulatorHook] Failed to load user profile', {
        userId,
        error: error.message,
      });
      // 不阻塞任务执行，只记录错误
    }
  }

  /**
   * 任务执行后：提取会话特征并累积通用字段到用户画像
   */
  async postExec(context: TaskContext, result: any): Promise<void> {
    const { metadata, context: taskContext } = context;

    // 获取 userId
    const userId = (metadata as any).userId || metadata.userId;

    if (!userId || !taskContext?.workingMemory?.userProfile) {
      return; // 没有 userId 或 userProfile，跳过
    }

    try {
      const store = getDataStore();

      // 1. 提取本次会话特征
      const sessionFeatures = this.extractGenericFeatures(context, result);

      // 2. 累积通用字段到用户画像
      const existingProfile = taskContext.workingMemory.userProfile as UserProfile;
      const updatedProfile = this.accumulateGenericProfile(existingProfile, sessionFeatures);

      // 3. 保存到数据库
      await store.updateUserProfile(userId, updatedProfile);

      // 4. 更新最后会话ID
      await store.updateUserLastSession(userId, context.sessionId);

      console.log('[UserProfileAccumulatorHook] Updated user profile', {
        userId,
        newVersion: updatedProfile.metadata.version,
        preferences: updatedProfile.preferences?.length || 0,
        habits: updatedProfile.habits?.length || 0,
        tags: updatedProfile.tags?.length || 0,
      });
    } catch (error: any) {
      console.error('[UserProfileAccumulatorHook] Failed to update user profile', {
        userId,
        error: error.message,
      });
      // 不抛出错误，避免影响任务完成
    }
  }

  /**
   * 提取本次会话的通用特征
   */
  private extractGenericFeatures(context: TaskContext, result: any): GenericSessionFeatures {
    const { context: taskContext, status, task } = context;
    const startTime = taskContext?.workingMemory?._sessionStartTime || Date.now();
    const duration = Date.now() - startTime;

    // 计算回复长度
    const responseLength = result?.output?.length || result?.response?.length || 0;

    // 获取总会话数（从旧 data 字段读取，向后兼容）
    const existingProfile = taskContext?.workingMemory?.userProfile as UserProfile;
    const totalSessions = (existingProfile?.data?.behavior?.totalSessions || 0) + 1;

    return {
      duration,
      task,
      status: status || 'unknown',
      timestamp: new Date(),
      responseLength,
      totalSessions,
    };
  }

  /**
   * 累积通用用户画像字段
   */
  private accumulateGenericProfile(
    profile: UserProfile,
    features: GenericSessionFeatures
  ): UserProfile {
    // 初始化数组（如果不存在）
    profile.preferences = profile.preferences || [];
    profile.habits = profile.habits || [];
    profile.tags = profile.tags || [];
    profile.data = profile.data || {};

    // === 通用偏好累积 ===

    // 根据回复长度添加偏好
    if (features.responseLength < 50) {
      this.addUnique(profile.preferences, '喜欢简洁回复');
    } else if (features.responseLength > 500) {
      this.addUnique(profile.preferences, '喜欢详细回复');
    }

    // === 通用习惯累积 ===

    // 根据会话时间添加习惯
    const hour = features.timestamp.getHours();
    if (hour >= 22 || hour <= 6) {
      this.addUnique(profile.habits, '夜间活跃');
    } else if (hour >= 9 && hour <= 17) {
      this.addUnique(profile.habits, '日间活跃');
    }

    // 根据会话持续时间添加习惯
    if (features.duration > 300000) { // 超过5分钟
      this.addUnique(profile.habits, '长时间会话');
    }

    // === 通用标签累积 ===

    // 根据会话次数添加标签
    if (features.totalSessions >= 10) {
      this.addUnique(profile.tags, '高活跃');
    } else if (features.totalSessions >= 5) {
      this.addUnique(profile.tags, '活跃用户');
    } else if (features.totalSessions === 1) {
      this.addUnique(profile.tags, '新用户');
    }

    // 向后兼容：更新旧的 data.behavior 字段
    if (profile.data.behavior) {
      profile.data.behavior.totalSessions = features.totalSessions;
    }

    // 更新元数据
    profile.metadata.lastUpdated = new Date();
    profile.metadata.version += 1;

    return profile;
  }

  /**
   * 添加唯一项到数组
   */
  private addUnique(arr: string[], item: string): void {
    if (!arr.includes(item)) {
      arr.push(item);
    }
  }
}
