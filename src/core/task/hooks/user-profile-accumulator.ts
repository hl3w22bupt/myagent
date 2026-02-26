/**
 * UserProfileAccumulatorHook - 用户画像累积 Hook
 *
 * 职责:
 * 1. preExec: 从 users 表加载 userId 的 userProfile，注入到 workingMemory
 * 2. postExec: 提取本次会话特征，累积到 userId 的画像，保存到 users 表
 *
 * 用于 MyEcho 集成，支持 AI 女友用户画像的跨会话累积。
 */

import { BaseTaskHook } from './base';
import type { TaskContext } from './types';
import { getDataStore, type UserProfile } from '../../database/data-store';

/**
 * 会话特征提取结果
 */
interface SessionFeatures {
  duration: number;
  task: string;
  status: string;
  timestamp: Date;
  responseLength: number;
  emotion?: string;
  memoryExtract?: any;
}

/**
 * 用户画像累积 Hook
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
          currentTurn: 0,
          messages: [],
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
        totalSessions: user.profile.behavior.totalSessions,
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
   * 任务执行后：提取会话特征并累积到用户画像
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
      const sessionFeatures = this.extractSessionFeatures(context, result);

      // 2. 累积到用户画像
      const existingProfile = taskContext.workingMemory.userProfile as UserProfile;
      const updatedProfile = this.accumulateProfile(existingProfile, sessionFeatures);

      // 3. 保存到数据库
      await store.updateUserProfile(userId, updatedProfile);

      // 4. 更新最后会话ID
      await store.updateUserLastSession(userId, context.sessionId);

      console.log('[UserProfileAccumulatorHook] Updated user profile', {
        userId,
        newVersion: updatedProfile.metadata.version,
        totalSessions: updatedProfile.behavior.totalSessions,
        avgSessionLength: updatedProfile.behavior.avgSessionLength,
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
   * 提取本次会话的特征
   */
  private extractSessionFeatures(context: TaskContext, result: any): SessionFeatures {
    const { context: taskContext, status, task } = context;
    const startTime = taskContext?.workingMemory?._sessionStartTime || Date.now();
    const duration = Date.now() - startTime;

    // 从结构化输出中提取情绪
    let emotion: string | undefined;
    let memoryExtract: any;

    if (result?.structuredOutput) {
      const structured = result.structuredOutput;
      emotion = structured.emotion || structured.emotion_type;
      memoryExtract = structured.memory_extract || structured.memoryExtract;
    } else if (result?.metadata?.structuredOutput) {
      const structured = result.metadata.structuredOutput;
      emotion = structured.emotion || structured.emotion_type;
      memoryExtract = structured.memory_extract || structured.memoryExtract;
    }

    // 计算回复长度
    const responseLength = result?.output?.length || result?.response?.length || 0;

    return {
      duration,
      task,
      status: status || 'unknown',
      timestamp: new Date(),
      responseLength,
      emotion,
      memoryExtract,
    };
  }

  /**
   * 累积用户画像数据
   */
  private accumulateProfile(
    existing: UserProfile,
    features: SessionFeatures
  ): UserProfile {
    // 更新行为统计
    existing.behavior.totalSessions += 1;

    // 更新平均会话长度
    const totalSessions = existing.behavior.totalSessions;
    const prevAvgLength = existing.behavior.avgSessionLength || 0;
    existing.behavior.avgSessionLength =
      (prevAvgLength * (totalSessions - 1) + features.duration) / totalSessions;

    // 更新活跃小时
    const currentHour = features.timestamp.getHours();
    if (!existing.behavior.activeHours.includes(currentHour)) {
      existing.behavior.activeHours.push(currentHour);
    }

    // 更新情绪分布
    if (features.emotion) {
      const emotionLower = features.emotion.toLowerCase();
      if (emotionLower.includes('开心') || emotionLower.includes('happy')) {
        existing.responseStyle.emotionDistribution.happy += 1;
      } else if (emotionLower.includes('关心') || emotionLower.includes('caring')) {
        existing.responseStyle.emotionDistribution.caring += 1;
      } else if (emotionLower.includes('活泼') || emotionLower.includes('调皮') || emotionLower.includes('playful')) {
        existing.responseStyle.emotionDistribution.playful += 1;
      } else if (emotionLower.includes('温柔') || emotionLower.includes('gentle')) {
        existing.responseStyle.emotionDistribution.gentle += 1;
      }
    }

    // 更新平均回复长度
    const prevAvgResponseLength = existing.responseStyle.avgResponseLength || 0;
    existing.responseStyle.avgResponseLength =
      (prevAvgResponseLength * (totalSessions - 1) + features.responseLength) / totalSessions;

    // 从 memoryExtract 中提取常用短语
    if (features.memoryExtract) {
      if (features.memoryExtract.preference) {
        const phrases = existing.responseStyle.commonPhrases || [];
        const prefStr = String(features.memoryExtract.preference);
        if (!phrases.includes(prefStr)) {
          phrases.push(prefStr);
          existing.responseStyle.commonPhrases = phrases.slice(-20); // 保留最近20个
        }
      }

      // 更新场景记忆
      if (features.memoryExtract.event) {
        const scenario = features.memoryExtract.event.substring(0, 50); // 简化场景名
        if (!existing.responsePatterns[scenario]) {
          existing.responsePatterns[scenario] = {
            typicalEmotion: features.emotion || 'neutral',
            commonPhrases: [],
            effectiveness: 1,
          };
        } else {
          existing.responsePatterns[scenario].effectiveness += 1;
        }
      }
    }

    // 更新元数据
    existing.metadata.lastUpdated = new Date();
    existing.metadata.version += 1;

    return existing;
  }
}
