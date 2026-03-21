import { useState, useEffect } from 'react'
import { soulAgentsAPI } from '../services/api'
import './AutonomousAgents.css'

function AutonomousAgents() {
  const [souls, setSouls] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [configModal, setConfigModal] = useState({ show: false, soulId: null, config: null, loading: false })
  const [executionHistory, setExecutionHistory] = useState({})
  const [historyLoading, setHistoryLoading] = useState({})
  const [expandedHistory, setExpandedHistory] = useState({})

  useEffect(() => {
    const fetchSouls = async () => {
      try {
        const response = await soulAgentsAPI.getStatus()
        if (response.success) {
          console.log('[API Response] Souls data:', response.data.souls)

          // 检查每个实例是否有 soulId
          response.data.souls.forEach((soul: any) => {
            console.log(`[API Response] Soul ${soul.soulId} has ${soul.instances?.length || 0} instances`)
            soul.instances?.forEach((instance: any, idx: number) => {
              console.log(`[API Response] Instance ${idx}:`, {
                sessionId: instance.sessionId,
                soulId: instance.soulId,
                hasSoulId: !!instance.soulId
              })
            })
          })

          setSouls(response.data.souls)
          setSummary(response.data.summary)
        } else {
          throw new Error(response.error || 'Failed to fetch souls')
        }
        setLoading(false)
      } catch (err) {
        console.error('Error fetching autonomous agents:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    fetchSouls()
    const interval = setInterval(fetchSouls, 10000)
    return () => clearInterval(interval)
  }, [])

  const getStatusInfo = (status) => {
    const statusMap = {
      ACTIVE: {
        label: '运行中',
        className: 'active',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
        )
      },
      HIBERNATED: {
        label: '休眠中',
        className: 'hibernated',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        )
      },
      IDLE: {
        label: '空闲',
        className: 'idle',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      },
      STOPPED: {
        label: '已停止',
        className: 'stopped',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
          </svg>
        )
      }
    }
    return statusMap[status] || statusMap.IDLE
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '从未'

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`

    return date.toLocaleDateString()
  }

  const formatUptime = (milliseconds) => {
    if (!milliseconds) return '0秒'

    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}天 ${hours % 24}小时`
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`
    if (minutes > 0) return `${minutes}分钟`
    return `${seconds}秒`
  }

  // 收集所有 instances（扁平化）
  const allInstances = souls.flatMap(soul =>
    soul.instances.map(instance => ({
      ...instance,
      soulDisplayName: soul.displayName,
      soulId: soul.soulId,
      soulDescription: soul.description,
      soulPrimitives: soul.primitives
    }))
  )

  // 过滤 instances（基于状态）
  const filteredInstances = allInstances.filter(instance => {
    // Filter by status
    if (filter === 'all') {
      return true
    } else if (filter === 'active') {
      return instance.status === 'ACTIVE'
    } else if (filter === 'hibernated') {
      return instance.status === 'HIBERNATED' || instance.status === 'IDLE'
    }
    return true
  })

  // 搜索过滤
  const searchedInstances = filteredInstances.filter(instance => {
    if (!searchQuery.trim()) return true

    const query = searchQuery.toLowerCase()
    const sessionIdMatch = instance.sessionId.toLowerCase().includes(query)
    const userIdMatch = instance.userId?.toLowerCase().includes(query)
    const soulNameMatch = instance.soulDisplayName?.toLowerCase().includes(query)
    const soulIdMatch = instance.soulId?.toLowerCase().includes(query)

    return sessionIdMatch || userIdMatch || soulNameMatch || soulIdMatch
  })

  const totalActive = souls.reduce((sum, soul) => sum + soul.stats.active, 0)
  const totalHibernated = souls.reduce((sum, soul) => sum + soul.stats.hibernated, 0)
  const totalIdle = souls.reduce((sum, soul) => sum + soul.stats.idle, 0)
  const totalInstances = souls.reduce((sum, soul) => sum + soul.stats.totalInstances, 0)

  // 查看配置
  const handleViewConfig = async (soulId) => {
    setConfigModal({ show: true, soulId, config: null, loading: true })
    try {
      const response = await soulAgentsAPI.getConfig(soulId)
      if (response.success) {
        setConfigModal({ show: true, soulId, config: response.data, loading: false })
      }
    } catch (error) {
      console.error('Failed to fetch soul config:', error)
      setConfigModal({ show: true, soulId, config: null, loading: false, error: error.message })
    }
  }

  // 关闭模态框
  const handleCloseModal = () => {
    setConfigModal({ show: false, soulId: null, config: null, loading: false })
  }

  // 加载执行历史
  const loadExecutionHistory = async (soulId, sessionId) => {
    setHistoryLoading(prev => ({ ...prev, [sessionId]: true }))

    try {
      console.log('[ExecutionHistory] Loading for:', { soulId, sessionId })

      const response = await soulAgentsAPI.getExecutionHistory(soulId, {
        sessionId,
        limit: 10
      })

      console.log('[ExecutionHistory] Response:', {
        soulId,
        sessionId,
        count: response.data?.history?.length,
        firstRecord: response.data?.history?.[0]
      })

      if (response.success) {
        setExecutionHistory(prev => ({
          ...prev,
          [sessionId]: response.data.history
        }))
      }
    } catch (error) {
      console.error('Failed to load execution history:', error)
    } finally {
      setHistoryLoading(prev => ({ ...prev, [sessionId]: false }))
    }
  }

  // 切换执行历史展开/折叠
  const toggleHistory = async (soulId, sessionId) => {
    console.log('[toggleHistory] Called with:', { soulId, sessionId })

    const isCurrentlyExpanded = expandedHistory[sessionId]

    // 如果当前是展开的，折叠它
    if (isCurrentlyExpanded) {
      setExpandedHistory(prev => ({ ...prev, [sessionId]: false }))
      return
    }

    // 如果当前是折叠的，展开它并加载数据
    setExpandedHistory(prev => ({ ...prev, [sessionId]: true }))

    // 如果还没有加载过数据，加载它
    if (!executionHistory[sessionId]) {
      await loadExecutionHistory(soulId, sessionId)
    }
  }

  // 格式化时间戳
  const formatExecutionTime = (timestamp) => {
    if (!timestamp) return '未知'

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`

    return date.toLocaleDateString()
  }

  if (error) {
    return (
      <div className="autonomous-agents-page">
        <div className="error-state">
          <svg style={{ width: '64px', height: '64px', margin: '0 auto 1rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3>加载失败</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="retry-button">
            重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="autonomous-agents-page">
      {/* Filter Section with Integrated Stats */}
      <div className="filter-section">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            全部
            <span className="filter-count">{totalInstances}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            运行中
            <span className="filter-count">{totalActive}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'hibernated' ? 'active' : ''}`}
            onClick={() => setFilter('hibernated')}
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            休眠中
            <span className="filter-count">{totalHibernated + totalIdle}</span>
          </button>
        </div>

        {/* Search Box */}
        <div className="search-box">
          <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索 Session ID 或 User ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>加载自主智能体...</p>
        </div>
      ) : searchedInstances.length === 0 ? (
        <div className="empty-state">
          <svg style={{ width: '64px', height: '64px', margin: '0 auto 1rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3>暂无自主智能体实例</h3>
          <p>{filter === 'all' ? '没有找到任何自主智能体实例' : `没有找到${filter === 'active' ? '运行中' : '休眠中'}的实例`}</p>
        </div>
      ) : (
        <div className="instances-grid">
          {searchedInstances.map((instance) => {
            const statusInfo = getStatusInfo(instance.status)
            return (
              <div key={instance.sessionId} className={`instance-card instance-${statusInfo.className}`}>
                {/* Instance Header - Primary Info */}
                <div className="instance-card-header">
                  <div className="instance-main-info">
                    <div className={`instance-status-badge status-${statusInfo.className}`}>
                      {statusInfo.icon}
                      <span>{statusInfo.label}</span>
                    </div>
                    <div className="instance-identity">
                      <div className="session-id">{instance.sessionId}</div>
                      <div className="user-id">{instance.userId}</div>
                    </div>
                  </div>
                </div>

                {/* Soul Type Info - Always Visible */}
                <div className="soul-type-info-compact">
                  <div className="soul-type-compact">
                    <div className="soul-avatar-small">
                      {instance.soulDisplayName?.charAt(0)?.toUpperCase() || instance.soulId?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="soul-type-meta">
                      <div className="soul-type-name">{instance.soulDisplayName}</div>
                      <div className="soul-type-id">{instance.soulId}</div>
                    </div>
                    <button
                      className="view-config-btn-mini"
                      onClick={() => handleViewConfig(instance.soulId)}
                      title="查看 Soul 和 Subagent 配置"
                    >
                      <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                  {instance.soulDescription && (
                    <div className="soul-type-description">{instance.soulDescription}</div>
                  )}
                </div>

                {/* Instance Body - Details */}
                <div className="instance-card-body">
                  {/* Current Task - Enhanced Display */}
                  {instance.status === 'ACTIVE' && instance.currentTask && (
                    <div className="current-task-section">
                      <div className="current-task-header">
                        <div className="current-task-indicator">
                          <span className="pulse-dot"></span>
                          <span className="current-task-label">正在执行</span>
                        </div>
                        <span className="current-task-duration">
                          已运行 {formatUptime(Date.now() - instance.lastActivity)}
                        </span>
                      </div>
                      <div className="current-task-name">
                        {instance.currentTask}
                      </div>
                      {instance.currentTaskDescription && (
                        <div className="current-task-description">
                          {instance.currentTaskDescription}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="instance-detail-row">
                    <span className="detail-label">最后活动</span>
                    <span className="detail-value">{formatTimestamp(instance.lastActivity)}</span>
                  </div>

                  {instance.scheduledWakeup && (
                    <div className="instance-detail-row">
                      <span className="detail-label">计划唤醒</span>
                      <span className="detail-value">
                        {new Date(instance.scheduledWakeup).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {instance.statistics && (
                    <div className="instance-stats-row">
                      <div className="instance-stat-mini">
                        <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>{instance.statistics.totalTasks || 0}</span>
                      </div>
                      <div className="instance-stat-mini">
                        <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{formatUptime(instance.statistics.uptime || 0)}</span>
                      </div>
                    </div>
                  )}

                  {/* Execution History Toggle */}
                  <div className="instance-history">
                    <button
                      className="history-toggle"
                      onClick={() => toggleHistory(instance.soulId, instance.sessionId)}
                    >
                      <svg
                        className="history-chevron"
                        style={{
                          width: '14px',
                          height: '14px',
                          transform: expandedHistory[instance.sessionId] ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          marginRight: '0.5rem'
                        }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      执行历史
                      {executionHistory[instance.sessionId] && (
                        <span className="history-count">({executionHistory[instance.sessionId].length})</span>
                      )}
                    </button>

                    {historyLoading[instance.sessionId] && expandedHistory[instance.sessionId] && (
                      <div className="history-loading">加载中...</div>
                    )}

                    {expandedHistory[instance.sessionId] && executionHistory[instance.sessionId] && !historyLoading[instance.sessionId] && (
                      <div className="history-list">
                        {executionHistory[instance.sessionId].length === 0 ? (
                          <div className="no-history">暂无执行记录</div>
                        ) : (
                          executionHistory[instance.sessionId].map((record) => (
                            <div key={record.id} className="history-item">
                              <div className="history-header">
                                <div className={`history-status status-${record.status.toLowerCase()}`}>
                                  {record.status === 'completed' && '✓'}
                                  {record.status === 'failed' && '✗'}
                                  {record.status === 'running' && '→'}
                                  {record.status === 'hibernated' && '💤'}
                                </div>
                                <span className="history-time">
                                  {formatExecutionTime(record.triggeredAt)}
                                </span>
                                {record.duration && (
                                  <span className="history-duration">
                                    ({record.duration}ms)
                                  </span>
                                )}
                              </div>

                              <div className="history-content">
                                <div className="history-task">{record.currentTask}</div>

                                {record.triggerSource && (
                                  <div className="history-trigger">
                                    触发: {record.triggerSource}
                                  </div>
                                )}

                                {record.primitiveCalls && record.primitiveCalls.length > 0 && (
                                  <div className="history-primitives">
                                    {record.primitiveCalls.map((call, idx) => (
                                      <span key={idx} className={`primitive-call ${call.success ? 'success' : 'failed'}`}>
                                        {call.name}
                                        {!call.success && ' ❌'}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {record.llmDecision && (
                                  <div className="history-decision">
                                    {record.llmDecision}
                                  </div>
                                )}

                                {record.error && (
                                  <div className="history-error">
                                    错误: {record.error}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Configuration Modal */}
      {configModal.show && (
        <div className="config-modal-overlay" onClick={handleCloseModal}>
          <div className="config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {configModal.config?.soulConfig?.displayName || configModal.soulId} 配置
              </h2>
              <button
                className="modal-close"
                onClick={handleCloseModal}
                title="关闭"
              >
                ✕
              </button>
            </div>

            <div className="modal-content">
              {configModal.loading ? (
                <div className="modal-loading">
                  <div className="spinner"></div>
                  <p>加载配置中...</p>
                </div>
              ) : configModal.error ? (
                <div className="modal-error">
                  <p>⚠️ {configModal.error}</p>
                </div>
              ) : configModal.config ? (
                <>
                  {/* Soul Configuration */}
                  <div className="config-section">
                    <h3 className="section-title">
                      <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Soul 配置 (soul.yaml)
                    </h3>

                    {configModal.config.soulConfig.primitives && configModal.config.soulConfig.primitives.length > 0 && (
                      <div className="primitives-info">
                        <strong>可用原语:</strong>
                        <div className="primitives-list">
                          {configModal.config.soulConfig.primitives.map((primitive, index) => (
                            <span key={index} className="primitive-tag-mini">{primitive}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <pre className="config-code">
                      {configModal.config.soulYaml}
                    </pre>
                  </div>

                  {/* Subagent Configuration */}
                  {configModal.config.subagentFound && configModal.config.subagentConfig ? (
                    <div className="config-section">
                      <h3 className="section-title">
                        <svg style={{ width: '22px', height: '22px' }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
                        </svg>
                        Subagent 配置 (agent.yaml)
                      </h3>
                      <pre className="config-code">
                        {configModal.config.subagentConfig.yaml}
                      </pre>
                    </div>
                  ) : (
                    <div className="config-section">
                      <div className="no-subagent">
                        <svg style={{ width: '48px', height: '48px', margin: '0 auto 1rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 5.434 1.948.335 0 .657-.336 1.879-.336 1.879 0 1.012-.336 2.836-.336 2.836 0 1.637-1.879 2.836-1.879.335 0 .657.336 1.879.336 1.879 0 1.012.336 2.836.336 2.836 0 1.637-1.879 2.836-1.879.335 0-.657-.336-1.879-.336-1.879 0-1.012.336-2.836.336-2.836 0-1.637 1.879-2.836 1.879-.335 0-.657-.336-1.879-.336-1.879 0-1.012.336-2.836-.336-2.836-1.637 0-3.036-1.879-3.036-3.036 0-.657.336-1.879.336-1.879.336-1.012 0-.336-.336-2.836-.336-2.836 0-1.637 1.879-2.836 1.879-.335 0 .657-.336 1.879.336 1.879.0 1.012.336 2.836.336 2.836 0 1.637 1.879 2.836-1.879.335 0 .657.336 1.879.336 1.879 0 1.012-.336 2.836-.336 2.836-1.637 0 3.036-1.879 3.036-3.036.335 0 .657.336 1.879.336 1.879.0 1.012.336 2.836.336 2.836 0 1.637-1.879 2.836-1.879z" />
                        </svg>
                        <p>未找到 Subagent 配置</p>
                        <p className="text-small">路径: subagents/{configModal.config.soulConfig?.subagent}/agent.yaml</p>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AutonomousAgents
