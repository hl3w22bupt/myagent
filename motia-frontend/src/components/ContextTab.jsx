import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './ContextTab.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/**
 * Context Tab - 优化后的 UI/UX 设计
 * 使用 SVG 图标、更好的交互反馈、专业的视觉层次
 */
export default function ContextTab({ taskId }) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedCards, setExpandedCards] = useState(new Set(['summary', 'conversation']))

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/contexts/${taskId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setContext(data.data)
      })
      .catch(err => console.error('Failed to load context:', err))
      .finally(() => setLoading(false))
  }, [taskId])

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
      <div className="ctx-container">
        <div className="ctx-loading-state">
          <div className="ctx-loading-spinner"></div>
          <span style={{ fontSize: '14px', fontWeight: '500' }}>加载上下文数据...</span>
        </div>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="ctx-container">
        <div className="ctx-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: '500' }}>暂无上下文数据</span>
        </div>
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
    <div className="ctx-container">
      {/* 统计卡片 */}
      <div className="ctx-stats-card">
        <div className="ctx-stats-header">
          <h3 className="ctx-stats-title">上下文信息</h3>
          <span className="ctx-stat-badge">Context</span>
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
        {/* 摘要卡片 */}
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

        {/* 对话历史卡片 */}
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

        {/* 产物卡片 */}
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

        {/* 工作记忆卡片 */}
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

// ============== 子组件 ==============

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
      {/* 状态 */}
      {summary.currentStatus && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">当前状态</span>
          <span className="ctx-status-badge" style={{ backgroundColor: getStatusConfig(summary.currentStatus).bg, color: getStatusConfig(summary.currentStatus).color }}>
            {getStatusConfig(summary.currentStatus).label}
          </span>
        </div>
      )}

      {/* 会话意图 */}
      {summary.sessionIntent && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">会话意图</span>
          <span className="ctx-summary-value">{summary.sessionIntent}</span>
        </div>
      )}

      {/* 当前任务 */}
      {summary.currentTask && (
        <div className="ctx-summary-row">
          <span className="ctx-summary-label">当前任务</span>
          <span className="ctx-summary-value">{summary.currentTask}</span>
        </div>
      )}

      {/* 已完成步骤 */}
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

      {/* 下一步 */}
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

      {/* 文件修改 */}
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

      {/* 关键决策 */}
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

      {/* 问题解决 */}
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
