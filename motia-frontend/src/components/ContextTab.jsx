import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './ContextTab.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/**
 * Context Tab - 带子 Tab 的上下文视图
 * - Task Context: 任务上下文
 * - Session Context: 会话上下文
 * - User Context: 用户画像
 */
export default function ContextTab({ taskId, sessionId: propSessionId }) {
  // 子 Tab 状态
  const [activeSubTab, setActiveSubTab] = useState('task')
  const [sessionContext, setSessionContext] = useState(null)
  const [userContext, setUserContext] = useState(null)
  const [taskContext, setTaskContext] = useState(null)
  const [loading, setLoading] = useState({
    task: true,
    session: true,
    user: true,
  })

  // sessionId 从任务上下文获取，忽略 propSessionId（聊天用的 UUID）
  const [sessionId, setSessionId] = useState('')

  // 获取任务上下文（当切换到 task tab 时刷新）
  useEffect(() => {
    if (activeSubTab !== 'task') return

    const fetchTaskContext = async () => {
      setLoading(prev => ({ ...prev, task: true }))
      try {
        const res = await fetch(`${API_BASE_URL}/api/contexts/${taskId}`)
        const data = await res.json()
        if (data.success) {
          setTaskContext(data.data)
          // 从任务中获取真实的 sessionId（非聊天 UUID）
          if (data.data.sessionId) {
            setSessionId(data.data.sessionId)
          }
        }
      } catch (err) {
        console.error('Failed to load task context:', err)
      } finally {
        setLoading(prev => ({ ...prev, task: false }))
      }
    }

    fetchTaskContext()
  }, [taskId, activeSubTab])

  // 当 sessionId 变化时获取会话上下文
  useEffect(() => {
    if (!sessionId || activeSubTab !== 'session') return

    const fetchSessionContext = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`)
        const data = await res.json()
        if (data.success) {
          setSessionContext(data.data)
          // 如果会话中包含 userId，自动加载用户上下文
          if (data.data.userId) {
            fetchUserContext(data.data.userId)
          } else {
            // 没有 userId，不需要加载用户上下文
            setLoading(prev => ({ ...prev, user: false }))
          }
        }
      } catch (err) {
        console.error('Failed to load session context:', err)
      } finally {
        setLoading(prev => ({ ...prev, session: false }))
      }
    }

    fetchSessionContext()
  }, [sessionId, activeSubTab])

  // 获取用户上下文
  const fetchUserContext = async (userId) => {
    if (!userId) return
    setLoading(prev => ({ ...prev, user: true }))
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}`)
      const data = await res.json()
      if (data.success) {
        setUserContext(data.data)
      }
    } catch (err) {
      console.error('Failed to load user context:', err)
    } finally {
      setLoading(prev => ({ ...prev, user: false }))
    }
  }

  // 加载状态
  const isLoading = loading.task || loading.session || loading.user

  return (
    <div className="ctx-container">
      {/* 子 Tab 导航 */}
      <div className="ctx-subtabs">
        <button
          className={`ctx-subtab ${activeSubTab === 'task' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('task')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          任务上下文
        </button>
        <button
          className={`ctx-subtab ${activeSubTab === 'session' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('session')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          会话上下文
        </button>
        <button
          className={`ctx-subtab ${activeSubTab === 'user' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('user')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          用户画像
        </button>
      </div>

      {/* 内容区域 */}
      {activeSubTab === 'task' && (
        <TaskContextContent context={taskContext} loading={loading.task} />
      )}

      {activeSubTab === 'session' && (
        <SessionContextContent context={sessionContext} loading={loading.session} />
      )}

      {activeSubTab === 'user' && (
        <UserContextContent
          context={userContext}
          loading={loading.user}
        />
      )}
    </div>
  )
}

// ============== 任务上下文内容 ==============

function TaskContextContent({ context, loading }) {
  const [expandedCards, setExpandedCards] = useState(new Set(['summary', 'conversation']))

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="ctx-loading-state">
        <div className="ctx-loading-spinner"></div>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>加载任务上下文...</span>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="ctx-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>暂无任务上下文</span>
      </div>
    )
  }

  const stats = {
    rounds: context.conversationRounds?.length || 0,
    artifacts: context.artifactIndex?.length || 0,
    hasSummary: context.summary && Object.keys(context.summary).length > 0,
    status: context.summary?.currentStatus || 'pending',
  }

  return (
    <div className="ctx-content">
      {/* 统计卡片 */}
      <div className="ctx-stats-card">
        <div className="ctx-stats-header">
          <h3 className="ctx-stats-title">任务上下文</h3>
          <span className="ctx-stat-badge">Task</span>
          <span className="ctx-stat-divider">•</span>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">状态</span>
            <span className="ctx-stat-value" style={{
              color: stats.status === 'completed' ? '#10B981' : stats.status === 'failed' ? '#EF4444' : '#64748B'
            }}>
              {stats.status === 'completed' ? '已完成' : stats.status === 'failed' ? '失败' : '进行中'}
            </span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">轮次</span>
            <span className="ctx-stat-value">{stats.rounds}</span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">产物</span>
            <span className="ctx-stat-value">{stats.artifacts}</span>
          </div>
        </div>
      </div>

      {/* 卡片列表 */}
      <div className="ctx-cards-list">
        {stats.hasSummary && (
          <ContextCard
            title="摘要信息"
            iconType="summary"
            expanded={expandedCards.has('summary')}
            onToggle={() => toggleCard('summary')}
          >
            <SummaryContent summary={context.summary} />
          </ContextCard>
        )}

        {context.conversationRounds?.length > 0 && (
          <ContextCard
            title="对话历史"
            iconType="conversation"
            count={context.conversationRounds.length}
            expanded={expandedCards.has('conversation')}
            onToggle={() => toggleCard('conversation')}
          >
            <ConversationContent rounds={context.conversationRounds} />
          </ContextCard>
        )}

        {context.artifactIndex?.length > 0 && (
          <ContextCard
            title="产物"
            iconType="artifact"
            count={context.artifactIndex.length}
            expanded={expandedCards.has('artifacts')}
            onToggle={() => toggleCard('artifacts')}
          >
            <ArtifactsContent items={context.artifactIndex} />
          </ContextCard>
        )}

        {context.workingMemory && Object.keys(context.workingMemory).length > 0 && (
          <ContextCard
            title="工作记忆"
            iconType="memory"
            expanded={expandedCards.has('memory')}
            onToggle={() => toggleCard('memory')}
          >
            <MemoryContent data={context.workingMemory} />
          </ContextCard>
        )}
      </div>
    </div>
  )
}

// ============== 会话上下文内容 ==============

function SessionContextContent({ context, loading }) {
  const [expandedCards, setExpandedCards] = useState(new Set(['summary', 'conversation']))

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="ctx-loading-state">
        <div className="ctx-loading-spinner"></div>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>加载会话上下文...</span>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="ctx-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>暂无会话上下文</span>
      </div>
    )
  }

  const stats = {
    rounds: context.context?.conversationRounds?.length || 0,
    artifacts: context.artifacts?.length || 0,
    tasks: context.tasks?.length || 0,
    hasSummary: context.context?.summary && Object.keys(context.context.summary).length > 0,
  }

  return (
    <div className="ctx-content">
      {/* 统计卡片 */}
      <div className="ctx-stats-card">
        <div className="ctx-stats-header">
          <h3 className="ctx-stats-title">会话上下文</h3>
          <span className="ctx-stat-badge">Session</span>
          <span className="ctx-stat-divider">•</span>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">任务</span>
            <span className="ctx-stat-value">{stats.tasks}</span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">轮次</span>
            <span className="ctx-stat-value">{stats.rounds}</span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">产物</span>
            <span className="ctx-stat-value">{stats.artifacts}</span>
          </div>
        </div>
        <div className="ctx-stats-meta">
          <span className="ctx-meta-label">Session ID:</span>
          <span className="ctx-meta-value">{context.sessionId}</span>
        </div>
      </div>

      {/* 任务列表 */}
      {context.tasks?.length > 0 && (
        <div className="ctx-section">
          <h4 className="ctx-section-title">会话中的任务</h4>
          <div className="ctx-task-list">
            {context.tasks.map((task, i) => (
              <div key={i} className="ctx-task-item">
                <span className={`ctx-task-status ${task.status}`}></span>
                <span className="ctx-task-name">{task.task}</span>
                <span className="ctx-task-id">{task.taskId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 卡片列表 */}
      <div className="ctx-cards-list">
        {stats.hasSummary && (
          <ContextCard
            title="摘要信息"
            iconType="summary"
            expanded={expandedCards.has('summary')}
            onToggle={() => toggleCard('summary')}
          >
            <SummaryContent summary={context.context?.summary} />
          </ContextCard>
        )}

        {context.context?.conversationRounds?.length > 0 && (
          <ContextCard
            title="对话历史"
            iconType="conversation"
            count={context.context.conversationRounds.length}
            expanded={expandedCards.has('conversation')}
            onToggle={() => toggleCard('conversation')}
          >
            <ConversationContent rounds={context.context.conversationRounds} />
          </ContextCard>
        )}

        {context.artifacts?.length > 0 && (
          <ContextCard
            title="产物"
            iconType="artifact"
            count={context.artifacts.length}
            expanded={expandedCards.has('artifacts')}
            onToggle={() => toggleCard('artifacts')}
          >
            <ArtifactsContent items={context.artifacts} />
          </ContextCard>
        )}
      </div>
    </div>
  )
}

// ============== 用户画像内容 ==============

function UserContextContent({ context, loading }) {
  const [expandedCards, setExpandedCards] = useState(new Set(['profile', 'sessions']))

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  if (!context) {
    return (
    <div className="ctx-content">
      {loading ? (
        <div className="ctx-loading-state">
          <div className="ctx-loading-spinner"></div>
          <span style={{ fontSize: '14px', fontWeight: '500' }}>加载用户画像...</span>
        </div>
      ) : (
        <div className="ctx-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span style={{ fontSize: '14px', fontWeight: '500' }}>该会话暂无关联的用户画像</span>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
            用户画像会通过会话自动关联
          </p>
        </div>
      )}
    </div>
  )
  }

  const profile = context.profile || {}

  return (
    <div className="ctx-content">
      {/* 统计卡片 */}
      <div className="ctx-stats-card">
        <div className="ctx-stats-header">
          <h3 className="ctx-stats-title">用户画像</h3>
          <span className="ctx-stat-badge">User</span>
          <span className="ctx-stat-divider">•</span>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">偏好</span>
            <span className="ctx-stat-value">{profile.preferences?.length || 0}</span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">习惯</span>
            <span className="ctx-stat-value">{profile.habits?.length || 0}</span>
          </div>
          <div className="ctx-stat-item">
            <span className="ctx-stat-label">标签</span>
            <span className="ctx-stat-value">{profile.tags?.length || 0}</span>
          </div>
        </div>
        <div className="ctx-stats-meta">
          <span className="ctx-meta-label">User ID:</span>
          <span className="ctx-meta-value">{context.userId}</span>
          <span className="ctx-stat-divider">•</span>
          <span className="ctx-meta-label">Version:</span>
          <span className="ctx-meta-value">{profile.metadata?.version || 1}</span>
        </div>
      </div>

      {/* 卡片列表 */}
      <div className="ctx-cards-list">
        {/* 用户偏好 */}
        <ContextCard
          title="用户偏好"
          iconType="summary"
          expanded={expandedCards.has('profile')}
          onToggle={() => toggleCard('profile')}
        >
          <div className="ctx-user-profile">
            {profile.preferences && profile.preferences.length > 0 ? (
              <ul className="ctx-checklist">
                {profile.preferences.map((pref, i) => (
                  <li key={i}>
                    <span className="ctx-pref-icon">✓</span>
                    {pref}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ctx-empty-list">暂无偏好数据</div>
            )}
          </div>
        </ContextCard>

        {/* 用户习惯 */}
        {profile.habits && profile.habits.length > 0 && (
          <ContextCard
            title="用户习惯"
            iconType="conversation"
            count={profile.habits.length}
            expanded={expandedCards.has('habits')}
            onToggle={() => toggleCard('habits')}
          >
            <ul className="ctx-checklist">
              {profile.habits.map((habit, i) => (
                <li key={i}>
                  <span className="ctx-habit-icon">◷</span>
                  {habit}
                </li>
              ))}
            </ul>
          </ContextCard>
        )}

        {/* 用户标签 */}
        {profile.tags && profile.tags.length > 0 && (
          <ContextCard
            title="用户标签"
            iconType="artifact"
            count={profile.tags.length}
            expanded={expandedCards.has('tags')}
            onToggle={() => toggleCard('tags')}
          >
            <div className="ctx-tag-list">
              {profile.tags.map((tag, i) => (
                <span key={i} className="ctx-tag">{tag}</span>
              ))}
            </div>
          </ContextCard>
        )}

        {/* 关联会话列表 */}
        {context.sessions && context.sessions.length > 0 && (
          <ContextCard
            title="关联会话"
            iconType="memory"
            count={context.sessions.length}
            expanded={expandedCards.has('sessions')}
            onToggle={() => toggleCard('sessions')}
          >
            <div className="ctx-session-list">
              {context.sessions.map((sessionId, i) => (
                <div key={i} className="ctx-session-item">
                  <span className="ctx-session-id">{sessionId}</span>
                </div>
              ))}
            </div>
          </ContextCard>
        )}

        {/* 行为数据（保留向后兼容） */}
        {profile.data?.behavior && (
          <ContextCard
            title="行为数据"
            iconType="memory"
            expanded={expandedCards.has('behavior')}
            onToggle={() => toggleCard('behavior')}
          >
            <MemoryContent data={profile.data} />
          </ContextCard>
        )}
      </div>
    </div>
  )
}

// ============== 共享组件 ==============

function ContextCard({ title, iconType, count, expanded, onToggle, children }) {
  const icons = {
    summary: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2"/>
      </svg>
    ),
    conversation: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeWidth="2"/>
      </svg>
    ),
    artifact: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" strokeWidth="2"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" strokeWidth="2"/>
        <line x1="12" y1="22.08" x2="12" y2="12" strokeWidth="2"/>
      </svg>
    ),
    memory: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58" strokeWidth="2"/>
        <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58" strokeWidth="2"/>
      </svg>
    ),
  }

  return (
    <div className="ctx-card">
      <div className="ctx-card-header" onClick={onToggle}>
        <div className="ctx-header-left">
          <span className={`ctx-card-icon ${iconType || ''}`}>
            {icons[iconType] || icons.summary}
          </span>
          <span className="ctx-card-title">{title}</span>
          {count !== undefined && <span className="ctx-count-badge">{count}</span>}
        </div>
        <svg className={`ctx-chevron ${expanded ? 'expanded' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </div>
      <div className={`ctx-card-body ${expanded ? 'visible' : ''}`}>
        {children}
      </div>
    </div>
  )
}

function SummaryContent({ summary }) {
  const getStatusConfig = (status) => {
    const configs = {
      pending: { color: '#6B7280', bg: '#F3F4F6', label: '待处理' },
      running: { color: '#3B82F6', bg: '#DBEAFE', label: '运行中' },
      in_progress: { color: '#3B82F6', bg: '#DBEAFE', label: '进行中' },
      completed: { color: '#059669', bg: '#D1FAE5', label: '已完成' },
      failed: { color: '#DC2626', bg: '#FEE2E2', label: '失败' },
    }
    return configs[status] || configs.pending
  }

  const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )

  return (
    <div className="ctx-summary">
      {summary.currentStatus && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">当前状态</span>
          <span className="ctx-status-badge" style={{ backgroundColor: getStatusConfig(summary.currentStatus).bg, color: getStatusConfig(summary.currentStatus).color }}>
            {getStatusConfig(summary.currentStatus).label}
          </span>
        </div>
      )}

      {summary.sessionIntent && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">会话意图</span>
          <span className="ctx-summary-value">{summary.sessionIntent}</span>
        </div>
      )}

      {summary.currentTask && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">当前任务</span>
          <span className="ctx-summary-value">{summary.currentTask}</span>
        </div>
      )}

      {summary.completedSteps?.length > 0 && (
        <div className="ctx-summary-block">
          <div className="ctx-block-header">
            <span className="ctx-block-title">已完成步骤</span>
            <span className="ctx-block-count">{summary.completedSteps.length}</span>
          </div>
          <ul className="ctx-checklist">
            {summary.completedSteps.map((step, i) => (
              <li key={i}>
                <span className="ctx-check-icon"><CheckIcon /></span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.nextSteps?.length > 0 && (
        <div className="ctx-summary-block">
          <div className="ctx-block-header">
            <span className="ctx-block-title">下一步</span>
            <span className="ctx-block-count">{summary.nextSteps.length}</span>
          </div>
          <ul className="ctx-next-steps">
            {summary.nextSteps.map((step, i) => <li key={i}>{step}</li>)}
          </ul>
        </div>
      )}

      {summary.filesModified?.length > 0 && (
        <div className="ctx-summary-block">
          <div className="ctx-block-header">
            <span className="ctx-block-title">文件修改</span>
            <span className="ctx-block-count">{summary.filesModified.length}</span>
          </div>
          <div className="ctx-file-list">
            {summary.filesModified.map((file, i) => (
              <div key={i} className="ctx-file-row">
                <span className={`ctx-file-action ${file.action}`}>{file.action}</span>
                <code className="ctx-file-path" title={file.path}>{file.path}</code>
                <button
                  className="ctx-copy-btn ctx-copy-btn-small"
                  onClick={() => navigator.clipboard.writeText(file.path)}
                  title="复制路径"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.decisionsMade?.length > 0 && (
        <div className="ctx-summary-block">
          <div className="ctx-block-header">
            <span className="ctx-block-title">关键决策</span>
            <span className="ctx-block-count">{summary.decisionsMade.length}</span>
          </div>
          <div className="ctx-decisions">
            {summary.decisionsMade.map((decision, i) => (
              <div key={i} className="ctx-decision-item">
                <strong>{decision.topic}</strong>
                <p>{decision.decision}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.errorsAndSolutions?.length > 0 && (
        <div className="ctx-summary-block">
          <div className="ctx-block-header">
            <span className="ctx-block-title">问题解决</span>
            <span className="ctx-block-count">{summary.errorsAndSolutions.length}</span>
          </div>
          <div className="ctx-errors">
            {summary.errorsAndSolutions.map((item, i) => (
              <div key={i} className="ctx-error-item">
                <span className="ctx-error-text">
                  <svg className="ctx-error-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4m0 4h.01"/>
                  </svg>
                  {item.error}
                </span>
                <span className="ctx-error-solution">
                  <svg className="ctx-success-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {item.solution}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationContent({ rounds }) {
  return (
    <div className="ctx-timeline">
      {rounds.map((round, i) => {
        const isLast = i === rounds.length - 1
        const hasError = !!round.error
        const status = hasError ? 'failed' : 'completed'

        return (
          <div key={i} className="ctx-timeline-item">
            <div className="ctx-timeline-node">
              <div className={`ctx-timeline-dot ctx-timeline-dot-${status}`}></div>
              {!isLast && <div className="ctx-timeline-line"></div>}
            </div>
            <div className="ctx-timeline-content">
              <div className="ctx-round-meta">
                <span className="ctx-round-badge">Round {round.round || i + 1}</span>
                <span className="ctx-round-time">{formatTime(round.timestamp)}</span>
              </div>

              <div className="ctx-messages">
                <div className="ctx-message ctx-message-user">
                  <span className="ctx-message-role">User</span>
                  <p>{round.userMessage}</p>
                </div>

                {round.assistantOutput && (
                  <div className="ctx-message ctx-message-assistant">
                    <span className="ctx-message-role">Assistant</span>
                    <p>{round.assistantOutput}</p>
                  </div>
                )}

                {round.error && (
                  <div className="ctx-message ctx-message-error">
                    <span className="ctx-message-role">Error</span>
                    <p>{round.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ArtifactsContent({ items }) {
  const typeConfig = {
    video: { icon: '🎬', bg: 'linear-gradient(135deg, #F3E8FF, #E9D5FF)', color: '#7C3AED' },
    image: { icon: '🖼️', bg: 'linear-gradient(135deg, #FCE7F3, #FBCFE8)', color: '#BE185D' },
    audio: { icon: '🎵', bg: 'linear-gradient(135deg, #FED7AA, #FDBA74)', color: '#C2410C' },
    code: { icon: '💻', bg: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)', color: '#047857' },
    html: { icon: '🌐', bg: 'linear-gradient(135deg, #DBEAFE, #BFDBFE)', color: '#1D4ED8' },
    json: { icon: '📋', bg: 'linear-gradient(135deg, #E0E7FF, #C7D2FE)', color: '#4338CA' },
    text: { icon: '📝', bg: 'linear-gradient(135deg, #F3F4F6, #E5E7EB)', color: '#374151' },
    markdown: { icon: '📄', bg: 'linear-gradient(135deg, #E5E7EB, #D1D5DB)', color: '#1F2937' },
    infographic: { icon: '📊', bg: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)', color: '#9D174D' },
    file: { icon: '📁', bg: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', color: '#64748B' },
  }

  const [copiedId, setCopiedId] = useState(null)

  const copyPath = (path, id) => {
    navigator.clipboard.writeText(path)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="ctx-artifacts-grid">
      {items.map((item, i) => {
        const config = typeConfig[item.artifactType] || typeConfig.file
        const isCopied = copiedId === item.id
        return (
          <div key={i} className="ctx-artifact-card">
            <div className="ctx-artifact-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="ctx-artifact-icon" style={{ background: config.bg }}>
                  {config.icon}
                </span>
                <span className="ctx-artifact-type" style={{ color: config.color }}>
                  {item.artifactType}
                </span>
              </div>
              {item.action === 'generated' && (
                <span className="ctx-generated-badge">GENERATED</span>
              )}
            </div>
            {item.action !== 'generated' && (
              <span className="ctx-artifact-action">{item.action}</span>
            )}
            {item.path && (
              <div className="ctx-artifact-path-wrapper">
                <code className="ctx-artifact-path" title={item.path}>{item.path}</code>
                <button
                  className={`ctx-copy-btn ${isCopied ? 'copied' : ''}`}
                  onClick={() => copyPath(item.path, item.id)}
                  title={isCopied ? '已复制' : '复制路径'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isCopied ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </>
                    )}
                  </svg>
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MemoryContent({ data }) {
  return (
    <div className="ctx-memory-wrapper">
      <SyntaxHighlighter
        language="json"
        style={vscDarkPlus}
        customStyle={{ margin: 0, borderRadius: '8px', fontSize: '12px' }}
      >
        {JSON.stringify(data, null, 2)}
      </SyntaxHighlighter>
    </div>
  )
}

function formatTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
