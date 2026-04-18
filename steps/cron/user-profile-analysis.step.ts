/**
 * User Profile Analysis Cron Step
 *
 * 每天 9 PM 运行，使用 AI 分析用户画像：
 * - 获取活跃用户（最近 24 小时内有会话）
 * - 获取每个用户最近的 10 个会话
 * - 使用 Claude 分析用户的回复风格、说话模式、情绪倾向、话题偏好
 * - 更新用户画像
 * - 发出分析完成事件
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CronConfig } from 'motia';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * AI 分析结果接口
 */
interface AIAnalysisResult {
  /** 回复风格: 简洁/详细/正式/随意 */
  responseStyle?: {
    primary: string;
    confidence: number;
    description: string;
  };
  /** 说话模式/常用短语 */
  responsePatterns?: {
    phrases: string[];
    patterns: string[];
  };
  /** 情绪倾向: 开朗/内向/焦虑/冷静 */
  emotionalTendencies?: {
    primary: string;
    confidence: number;
    traits: string[];
  };
  /** 话题偏好: 游戏/工作/生活/情感 */
  topicPreferences?: {
    interests: string[];
    primaryTopics: string[];
  };
  /** 用户偏好 */
  preferences?: string[];
  /** 用户习惯 */
  habits?: string[];
  /** 建议的标签 */
  suggestedTags?: string[];
}

/**
 * Cron 配置
 */
export const config: CronConfig = {
  type: 'cron',
  name: 'UserProfileAnalysis',
  description: 'AI-powered user profile analysis running daily at 9 PM',
  cron: '0 21 * * *', // 每天 9 PM
  emits: ['user.profile.analyzed'],
  flows: ['user-analysis-flow'],
};

/**
 * Cron Handler
 */
export const handler = async ({ logger, emit }: any) => {
  logger.info('[UserProfileAnalysis] Starting daily user profile analysis');

  const store = getDataStore();
  await store.initialize();

  const anthropic = new Anthropic({
    apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  let totalUsersProcessed = 0;
  let totalUsersFailed = 0;

  try {
    // 获取最近 24 小时内有活动的会话
    const sessions = await store.listSessions(1000, 0);
    const activeSessions = sessions.filter(
      (session: any) => session.lastActiveAt.getTime() > oneDayAgo
    );

    logger.info('[UserProfileAnalysis] Found active sessions', {
      total: sessions.length,
      active: activeSessions.length,
    });

    if (activeSessions.length === 0) {
      logger.info('[UserProfileAnalysis] No active sessions in the last 24 hours');
      return;
    }

    // 获取所有用户（通过 PostgreSQL 直接查询以获取用户列表）
    const activeUserIds = new Set<string>();

    // 方法 1: 通过 last_session_id 关联
    for (const session of activeSessions) {
      try {
        const client = (store as any).pool;
        const userResult = await client.query(
          'SELECT user_id FROM users WHERE last_session_id = $1 LIMIT 1',
          [session.sessionId]
        );
        if (userResult.rows.length > 0) {
          activeUserIds.add(userResult.rows[0].user_id);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_err) {
        // 忽略错误
      }
    }

    // 方法 2: 获取最近创建/更新的所有用户
    try {
      const client = (store as any).pool;
      const usersResult = await client.query(
        'SELECT user_id, profile, updated_at FROM users WHERE updated_at > $1 ORDER BY updated_at DESC',
        [oneDayAgo]
      );

      for (const row of usersResult.rows) {
        activeUserIds.add(row.user_id);
      }
    } catch (err) {
      logger.warn('[UserProfileAnalysis] Failed to fetch active users', { error: (err as Error).message });
    }

    logger.info('[UserProfileAnalysis] Found unique active users', {
      count: activeUserIds.size,
    });

    // 处理每个用户
    for (const userId of activeUserIds) {
      try {
        await analyzeUser(userId, store, anthropic, logger, emit);
        totalUsersProcessed++;
      } catch (error: any) {
        totalUsersFailed++;
        logger.error('[UserProfileAnalysis] Failed to analyze user', {
          userId,
          error: error.message,
        });
      }
    }

    logger.info('[UserProfileAnalysis] Analysis complete', {
      processed: totalUsersProcessed,
      failed: totalUsersFailed,
    });

  } catch (error: any) {
    logger.error('[UserProfileAnalysis] Fatal error', {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * 分析单个用户
 */
async function analyzeUser(
  userId: string,
  store: any,
  anthropic: Anthropic,
  logger: any,
  emit: any
): Promise<void> {
  logger.info('[UserProfileAnalysis] Analyzing user', { userId });

  // 获取用户信息
  const user = await store.getUser(userId);
  if (!user) {
    logger.warn('[UserProfileAnalysis] User not found', { userId });
    return;
  }

  // 获取用户的会话
  const sessions = await store.getUserSessions(userId);
  if (!sessions || sessions.length === 0) {
    logger.info('[UserProfileAnalysis] No sessions found for user', { userId });
    return;
  }

  // 获取最近 10 个会话的对话上下文
  const recentSessions = sessions.slice(0, 10);
  const conversationData: string[] = [];

  for (const session of recentSessions) {
    try {
      const tasksResult = await store.listTasks({ sessionId: session.sessionId, limit: 5 });
      const tasks = tasksResult.tasks;

      for (const task of tasks) {
        try {
          const context = await store.getContext(task.id);
          if (context && context.conversationRounds) {
            for (const round of context.conversationRounds) {
              if (round.userMessage) {
                conversationData.push(`用户: ${round.userMessage}`);
              }
              if (round.assistantOutput) {
                conversationData.push(`助手: ${round.assistantOutput}`);
              }
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_err) {
          // 忽略单个任务获取失败
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      // 忽略单个会话获取失败
    }
  }

  if (conversationData.length === 0) {
    logger.info('[UserProfileAnalysis] No conversation data found for user', { userId });
    return;
  }

  // 构建对话文本摘要（限制长度）
  const conversationText = conversationData.slice(0, 50).join('\n');

  logger.info('[UserProfileAnalysis] Analyzing conversation data', {
    userId,
    conversationLength: conversationText.length,
  });

  // 使用 AI 分析
  const analysisResult = await analyzeWithAI(conversationText, anthropic, logger);

  // 合并 AI 建议的标签
  const existingTags = user.profile.tags || [];
  const suggestedTags = analysisResult.suggestedTags || [];
  const mergedTags = [...new Set([...existingTags, ...suggestedTags])];

  // 合并 preferences
  const existingPreferences = user.profile.preferences || [];
  const suggestedPreferences = analysisResult.preferences || [];
  const mergedPreferences = [...new Set([...existingPreferences, ...suggestedPreferences])];

  // 合并 habits
  const existingHabits = user.profile.habits || [];
  const suggestedHabits = analysisResult.habits || [];
  const mergedHabits = [...new Set([...existingHabits, ...suggestedHabits])];

  // 构建更新数据
  const updateData: any = {
    tags: mergedTags,
    preferences: mergedPreferences,
    habits: mergedHabits,
    data: {
      ...user.profile.data,
    },
  };

  // 更新各个分析维度
  if (analysisResult.responseStyle) {
    updateData.data.responseStyle = analysisResult.responseStyle;
  }
  if (analysisResult.responsePatterns) {
    updateData.data.responsePatterns = analysisResult.responsePatterns;
  }
  if (analysisResult.emotionalTendencies) {
    updateData.data.emotionalTendencies = analysisResult.emotionalTendencies;
  }
  if (analysisResult.topicPreferences) {
    updateData.data.topicPreferences = analysisResult.topicPreferences;
  }

  // 更新用户画像
  await store.updateUserProfile(userId, updateData);

  logger.info('[UserProfileAnalysis] User profile updated', {
    userId,
    newTags: suggestedTags,
    analysisResult: {
      responseStyle: analysisResult.responseStyle?.primary,
      emotionalTendencies: analysisResult.emotionalTendencies?.primary,
      topicPreferences: analysisResult.topicPreferences?.primaryTopics,
    },
  });

  // 发出分析完成事件
  await emit({
    topic: 'user.profile.analyzed',
    data: {
      userId,
      analysisResult,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * 使用 AI 分析对话内容
 */
async function analyzeWithAI(
  conversationText: string,
  anthropic: Anthropic,
  logger: any
): Promise<AIAnalysisResult> {
  try {
    const prompt = `你是一位专业的用户画像分析师。请分析以下用户对话内容，提取用户特征。

对话内容：
${conversationText}

请以 JSON 格式返回分析结果，包含以下字段：
1. responseStyle: 回复风格分析
   - primary: 主要风格（简洁/详细/正式/随意）
   - confidence: 置信度 (0-1)
   - description: 描述
2. responsePatterns: 说话模式
   - phrases: 常用短语数组
   - patterns: 说话模式数组
3. emotionalTendencies: 情绪倾向
   - primary: 主要倾向（开朗/内向/焦虑/冷静）
   - confidence: 置信度 (0-1)
   - traits: 特征数组
4. topicPreferences: 话题偏好
   - interests: 兴趣数组
   - primaryTopics: 主要话题数组（游戏/工作/生活/情感/技术/其他）
5. preferences: 用户偏好数组（3-5个，如"喜欢幽默回复"、"重视效率"、"喜欢详细解释"、"偏好图文结合"、"喜欢简洁明了"等）
6. habits: 用户习惯数组（3-5个，如"夜间活跃"、"经常测试"、"碎片化互动"、"频繁提问"、"批量处理任务"等）
7. suggestedTags: 建议的标签数组（3-5个）

返回格式示例：
{
  "responseStyle": {
    "primary": "简洁",
    "confidence": 0.8,
    "description": "用户偏好简短直接的回复"
  },
  "responsePatterns": {
    "phrases": ["好的", "明白了", "怎么做"],
    "patterns": ["直接提问", "寻求明确指导"]
  },
  "emotionalTendencies": {
    "primary": "冷静",
    "confidence": 0.7,
    "traits": ["理性", "目标导向", "情绪稳定"]
  },
  "topicPreferences": {
    "interests": ["编程", "技术学习", "问题解决"],
    "primaryTopics": ["工作", "技术"]
  },
  "preferences": ["喜欢幽默回复", "重视效率", "喜欢详细解释"],
  "habits": ["夜间活跃", "经常测试", "碎片化互动"],
  "suggestedTags": ["技术爱好者", "目标导向", "高效沟通"]
}

请只返回 JSON，不要包含其他说明文字。`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      // 尝试解析 JSON
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
        return result;
      }
    }

    // 如果解析失败，返回空结果
    logger.warn('[UserProfileAnalysis] Failed to parse AI response');
    return {};

  } catch (error: any) {
    logger.error('[UserProfileAnalysis] AI analysis failed', {
      error: error.message,
    });
    return {};
  }
}
