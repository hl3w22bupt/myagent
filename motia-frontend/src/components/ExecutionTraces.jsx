import { useState, useEffect } from 'react'
import { useMotiaStream } from '@motiadev/stream-client-react'
import './ExecutionTraces.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/**
 * Execution Traces Component.
 *
 * Displays hierarchical execution traces for Task, Agent, and Skill levels.
 * Shows real-time updates via stream subscription and historical data via API.
 */
function ExecutionTraces({ taskId }) {
  const [traces, setTraces] = useState([])
  const [hierarchy, setHierarchy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterLevel, setFilterLevel] = useState('all') // 'all', 'task', 'agent', 'skill'
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'started', 'running', 'completed', 'failed', 'retried'
  const [expandedItems, setExpandedItems] = useState(new Set())
  const [copiedField, setCopiedField] = useState(null) // Track which field was just copied

  const { stream } = useMotiaStream()

  // Fetch initial traces
  useEffect(() => {
    const fetchTraces = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/traces`)
        const data = await response.json()

        if (data.success) {
          setTraces(data.traces || [])
          setHierarchy(data.hierarchy)
        } else {
          setError(data.message || 'Failed to fetch traces')
        }
      } catch (err) {
        console.error('Failed to fetch execution traces:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchTraces()
  }, [taskId])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!stream) return

    const unsubscribe = stream.subscribe({
      streamName: 'executionTraces',
      groupId: taskId,
      onMessage: (message) => {
        setTraces((prev) => {
          // Update or add the trace
          const existingIndex = prev.findIndex((t) => t.id === message.id)
          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = message
            return updated
          } else {
            return [...prev, message]
          }
        })

        // Rebuild hierarchy
        setHierarchy((prev) => {
          if (!prev) return prev

          // Simple hierarchy rebuild
          const newHierarchy = { ...prev }
          // This is a simplified rebuild - in production, you'd want more efficient updates
          return newHierarchy
        })
      },
      onError: (err) => {
        console.error('Execution traces stream error:', err)
      },
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [stream, taskId])

  const toggleExpand = (itemId) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  const getFilteredTraces = () => {
    let filtered = traces

    if (filterLevel !== 'all') {
      filtered = filtered.filter((t) => t.level === filterLevel)
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((t) => t.status === filterStatus)
    }

    // Sort by timestamp
    return filtered.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'started':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        )
      case 'running':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" className="spinning">
            <path d="M12 2v4m0 4v4m0 4h4m-4 0h4" />
          </svg>
        )
      case 'completed':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-6-6l2-2" />
          </svg>
        )
      case 'failed':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        )
      case 'retried':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        )
      default:
        return null
    }
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'task':
        return '#8B5CF6'
      case 'agent':
        return '#3B82F6'
      case 'skill':
        return '#10B981'
      case 'tool-call':
        return '#F59E0B'
      default:
        return '#64748B'
    }
  }

  const getLevelLabel = (level) => {
    switch (level) {
      case 'task':
        return 'Task'
      case 'agent':
        return 'Agent'
      case 'skill':
        return 'Skill'
      case 'tool-call':
        return 'Tool Call'
      default:
        return level
    }
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  const formatDuration = (ms) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
    return `${(ms / 60000).toFixed(2)}m`
  }

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      console.log(`[ExecutionTraces] Copied ${label} to clipboard`)
      // Show copied feedback
      setCopiedField(label)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('[ExecutionTraces] Failed to copy:', err)
      // 降级方案：使用传统方法
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        console.log(`[ExecutionTraces] Copied ${label} to clipboard (fallback)`)
        // Show copied feedback
        setCopiedField(label)
        setTimeout(() => setCopiedField(null), 2000)
      } catch (e) {
        console.error('[ExecutionTraces] Fallback copy also failed:', e)
      }
      document.body.removeChild(textArea)
    }
  }

  const renderTraceItem = (trace, indent = 0) => {
    const isExpanded = expandedItems.has(trace.id)
    const levelColor = getLevelColor(trace.level)

    return (
      <div
        key={trace.id}
        className="trace-item"
        style={{ marginLeft: `${indent * 16}px` }}
      >
        <div
          className="trace-header"
          onClick={() => toggleExpand(trace.id)}
        >
          <div className="trace-icon">{getStatusIcon(trace.status)}</div>

          <div
            className="trace-level-badge"
            style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
          >
            {getLevelLabel(trace.level)}
          </div>

          <div className="trace-info">
            <span className="trace-name">
              {(trace.level === 'skill' || trace.level === 'tool-call') && trace.skillName ? trace.skillName : trace.id}
            </span>
            <span className="trace-stage">
              {trace.stage}
              {trace.purpose && ` - ${trace.purpose}`}
            </span>
            <span className="trace-status">{trace.status}</span>
            {trace.executionTime && (
              <span className="trace-duration">{formatDuration(trace.executionTime)}</span>
            )}
            {trace.durationMs && (
              <span className="trace-duration">{formatDuration(trace.durationMs)}</span>
            )}
          </div>

          <div className="trace-timestamp">{formatTimestamp(trace.timestamp)}</div>

          {(trace.inputData || trace.outputData || trace.error || (trace.metadata && (trace.metadata.toolInput || trace.metadata.toolResult || trace.metadata.error))) && (
            <div className="trace-expand-icon">
              {isExpanded ? '▼' : '▶'}
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="trace-details">
            {trace.inputData && (
              <div className="trace-detail-section">
                <div className="trace-detail-title">
                  Input:
                  <button
                    className={`copy-button ${copiedField === 'Input' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(
                      typeof trace.inputData === 'string'
                        ? trace.inputData
                        : JSON.stringify(trace.inputData, null, 2),
                      'Input'
                    )}
                    title="复制输入数据"
                  >
                    {copiedField === 'Input' ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span className="copy-feedback">已复制</span>
                      </>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
                <pre className="trace-detail-content">
                  {typeof trace.inputData === 'string'
                    ? trace.inputData
                    : JSON.stringify(trace.inputData, null, 2)}
                </pre>
              </div>
            )}

            {trace.outputData && (
              <div className="trace-detail-section">
                <div className="trace-detail-title">
                  Output:
                  <button
                    className={`copy-button ${copiedField === 'Output' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(
                      typeof trace.outputData === 'string'
                        ? trace.outputData
                        : JSON.stringify(trace.outputData, null, 2),
                      'Output'
                    )}
                    title="复制输出数据"
                  >
                    {copiedField === 'Output' ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span className="copy-feedback">已复制</span>
                      </>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
                <pre className="trace-detail-content">
                  {typeof trace.outputData === 'string'
                    ? trace.outputData
                    : JSON.stringify(trace.outputData, null, 2)}
                </pre>
              </div>
            )}

            {trace.error && (
              <div className="trace-detail-section error">
                <div className="trace-detail-title">
                  Error:
                  <button
                    className={`copy-button ${copiedField === 'Error' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(trace.error, 'Error')}
                    title="复制错误信息"
                  >
                    {copiedField === 'Error' ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span className="copy-feedback">已复制</span>
                      </>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
                <div className="trace-error-message">{trace.error}</div>
                {trace.errorStack && (
                  <pre className="trace-error-stack">{trace.errorStack}</pre>
                )}
              </div>
            )}

            {trace.retryCount > 0 && (
              <div className="trace-detail-section">
                <div className="trace-detail-title">Retries:</div>
                <div className="trace-retry-info">
                  {trace.retryCount} / {trace.maxRetries} attempts
                </div>
              </div>
            )}

            {/* Tool-call specific details */}
            {trace.level === 'tool-call' && trace.metadata && (
              <>
                {trace.metadata.toolInput && (
                  <div className="trace-detail-section">
                    <div className="trace-detail-title">
                      Tool Input:
                      <button
                        className={`copy-button ${copiedField === 'Tool Input' ? 'copied' : ''}`}
                        onClick={() => copyToClipboard(JSON.stringify(trace.metadata.toolInput, null, 2), 'Tool Input')}
                        title="复制工具输入"
                      >
                        {copiedField === 'Tool Input' ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span className="copy-feedback">已复制</span>
                          </>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                    <pre className="trace-detail-content">
                      {JSON.stringify(trace.metadata.toolInput, null, 2)}
                    </pre>
                  </div>
                )}

                {trace.metadata.toolResult && (
                  <div className="trace-detail-section">
                    <div className="trace-detail-title">
                      Tool Result:
                      <button
                        className={`copy-button ${copiedField === 'Tool Result' ? 'copied' : ''}`}
                        onClick={() => copyToClipboard(JSON.stringify(trace.metadata.toolResult, null, 2), 'Tool Result')}
                        title="复制工具结果"
                      >
                        {copiedField === 'Tool Result' ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span className="copy-feedback">已复制</span>
                          </>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                    <pre className="trace-detail-content">
                      {JSON.stringify(trace.metadata.toolResult, null, 2)}
                    </pre>
                  </div>
                )}

                {trace.metadata.parentSkill && (
                  <div className="trace-detail-section">
                    <div className="trace-detail-title">Called By:</div>
                    <div className="trace-detail-content">{trace.metadata.parentSkill}</div>
                  </div>
                )}
              </>
            )}

            {trace.metadata && (
              <div className="trace-detail-section">
                <div className="trace-detail-title">
                  Metadata:
                  <button
                    className={`copy-button ${copiedField === 'Metadata' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(JSON.stringify(trace.metadata, null, 2), 'Metadata')}
                    title="复制元数据"
                  >
                    {copiedField === 'Metadata' ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span className="copy-feedback">已复制</span>
                      </>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
                <pre className="trace-detail-content">
                  {JSON.stringify(trace.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderHierarchicalView = () => {
    if (!hierarchy) return null

    return (
      <div className="hierarchical-view">
        {hierarchy.task && hierarchy.task.map((trace) => renderTraceItem(trace, 0))}

        {hierarchy.agents && hierarchy.agents.map((agent) => (
          <div key={agent.agentId} className="agent-group">
            {agent.traces.map((trace) => renderTraceItem(trace, 1))}

            {agent.skills && agent.skills.map((skill) => (
              <div key={skill.skillName} className="skill-group">
                {skill.traces.map((trace) => renderTraceItem(trace, 2))}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="execution-traces loading">
        <div className="spinner"></div>
        <p>加载执行追踪...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="execution-traces error">
        <p>加载失败: {error}</p>
      </div>
    )
  }

  const filteredTraces = getFilteredTraces()

  return (
    <div className="execution-traces">
      <div className="traces-header">
        <h3>运行追踪</h3>
        <div className="traces-filters">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="filter-select"
          >
            <option value="all">所有级别</option>
            <option value="task">Task</option>
            <option value="agent">Agent</option>
            <option value="skill">Skill</option>
            <option value="tool-call">Tool Call</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">所有状态</option>
            <option value="started">已启动</option>
            <option value="running">执行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
            <option value="retried">重试</option>
          </select>

          <div className="traces-count">
            {filteredTraces.length} 条记录
          </div>
        </div>
      </div>

      <div className="traces-content">
        {filteredTraces.length === 0 ? (
          <div className="traces-empty">
            <p>暂无执行追踪记录</p>
          </div>
        ) : (
          <div className="traces-list">
            {filteredTraces.map((trace) => renderTraceItem(trace))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExecutionTraces
