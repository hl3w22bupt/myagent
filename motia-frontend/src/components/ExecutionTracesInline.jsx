import { useState, useEffect } from 'react'
import { useMotiaStream } from '@motiadev/stream-client-react'
import './ExecutionTracesInline.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/**
 * 内嵌式执行追踪组件 - 优化版
 * 采用数据密集型仪表板风格，层级清晰，视觉专业
 */
function ExecutionTracesInline({ taskId }) {
  const [traces, setTraces] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [expandedDetails, setExpandedDetails] = useState(new Set())
  const [copiedField, setCopiedField] = useState(null) // Track which field was just copied

  const { stream } = useMotiaStream()

  // 获取追踪数据
  useEffect(() => {
    const fetchTraces = async () => {
      try {
        console.log('[ExecutionTracesInline] Fetching traces for task:', taskId)
        const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/traces`)

        if (!response.ok) {
          console.warn('[ExecutionTracesInline] API response not OK:', response.status)
          setLoading(false)
          return
        }

        const data = await response.json()
        console.log('[ExecutionTracesInline] Received data:', data)

        if (data.success && Array.isArray(data.traces)) {
          console.log('[ExecutionTracesInline] Setting traces:', data.traces.length, 'items')
          setTraces(data.traces)
        } else {
          console.warn('[ExecutionTracesInline] Invalid response format:', data)
          setTraces([])
        }
      } catch (err) {
        console.error('[ExecutionTracesInline] Failed to fetch traces:', err)
        setTraces([])
      } finally {
        setLoading(false)
      }
    }

    fetchTraces()
  }, [taskId])

  // 实时订阅
  useEffect(() => {
    if (!stream) return

    let subscription = null

    try {
      subscription = stream.subscribeGroup('executionTraces', taskId)
      console.log('[ExecutionTracesInline] 订阅成功:', subscription)

      subscription.addChangeListener((data) => {
        console.log('[ExecutionTracesInline] 收到数据更新:', data)

        const entries = Array.isArray(data) ? data : data ? [data] : []
        console.log('[ExecutionTracesInline] 更新 traces:', entries.length, '条')

        setTraces((prev) => {
          const newTraces = [...prev]

          entries.forEach((message) => {
            if (!message) return

            const traceId = message.traceId || message.id
            if (!traceId) {
              console.warn('[ExecutionTracesInline] Message 缺少 ID:', message)
              return
            }

            const existingIndex = newTraces.findIndex((t) => t.traceId === traceId || t.id === traceId)

            if (existingIndex >= 0) {
              newTraces[existingIndex] = message
            } else {
              newTraces.push(message)
            }
          })

          return newTraces
        })
      })
    } catch (error) {
      console.error('[ExecutionTracesInline] 订阅失败:', error)
    }

    return () => {
      if (subscription) {
        subscription.close()
        console.log('[ExecutionTracesInline] 取消订阅')
      }
    }
  }, [stream, taskId])

  // 切换分组展开/收起
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  // 切换详情展开/收起
  const toggleDetail = (traceId) => {
    setExpandedDetails(prev => {
      const newSet = new Set(prev)
      if (newSet.has(traceId)) {
        newSet.delete(traceId)
      } else {
        newSet.add(traceId)
      }
      return newSet
    })
  }

  // 如果没有追踪数据且不在加载中，不显示组件
  if (!loading && traces.length === 0) {
    return null
  }

  // 聚合函数：将同一个 ID 的 trace 聚合在一起
  const groupTraces = (traces) => {
    const groups = new Map()

    traces.filter(t => t).forEach(trace => {
      let groupKey, groupId, displayName, displayLevel

      // 确定分组逻辑
      if (trace.level === 'skill' || trace.level === 'skill-internal') {
        const skillName = trace.skillName || 'Unknown'
        groupKey = `skill-${skillName}`
        groupId = skillName
        displayName = skillName
        displayLevel = 'skill'  // 统一显示为 skill
      } else if (trace.level === 'workflow-step') {
        // Workflow step trace (git-clone, HITL, etc.)
        const stepId = trace.metadata?.stepId || trace.agentId || 'unknown'
        const stepName = trace.metadata?.stepName || stepId
        const stepType = trace.metadata?.stepType || 'step'
        groupKey = `wf-step-${stepId}`
        groupId = stepId
        displayName = `${stepType}: ${stepName}`
        displayLevel = 'workflow-step'
      } else if (trace.level === 'agent' || trace.level === 'agent-internal') {
        const agentId = trace.agentId || 'unknown'
        groupKey = `agent-${agentId}`
        groupId = agentId

        // 使用 subjectTitle 和 subjectSubTitle 显示更友好的名称
        const subjectTitle = trace.metadata?.subjectTitle || 'Agent'
        const subjectSubTitle = trace.metadata?.subjectSubTitle

        if (subjectSubTitle) {
          displayName = `${subjectTitle} / ${subjectSubTitle}`
        } else {
          displayName = subjectTitle
        }

        displayLevel = 'agent'  // 统一显示为 agent
      } else {
        const taskId = trace.taskId || 'unknown'
        groupKey = `task-${taskId}`
        groupId = taskId
        displayName = 'Task'
        displayLevel = 'task'
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey,
          groupId,
          displayName,
          level: displayLevel,
          traces: [],
          startTime: null,
          endTime: null,
          finalStatus: 'pending'
        })
      }

      const group = groups.get(groupKey)
      group.traces.push(trace)

      const traceTime = new Date(trace.timestamp || trace.startedAt).getTime()
      if (!group.startTime || traceTime < group.startTime) {
        group.startTime = traceTime
      }
      if (!group.endTime || traceTime > group.endTime) {
        group.endTime = traceTime
      }

      // 判断 stage 类型
      const isPostStage = trace.stage === 'post' || trace.id?.endsWith('-post')
      const isPreStage = trace.stage === 'pre' || trace.id?.endsWith('-pre')

      // 检查这个 group 是否有任何 pre stage trace
      const groupHasPreStage = group.traces.some(t => t.stage === 'pre' || t.id?.endsWith('-pre'))

      if (isPostStage) {
        // post stage 的状态优先级最高
        if (trace.status === 'failed') {
          group.finalStatus = 'failed'
        } else if (trace.status === 'completed') {
          group.finalStatus = 'completed'
        }
      } else if (isPreStage) {
        // pre stage 的情况：先标记为 running，等 post stage 来决定最终状态
        if (trace.status === 'completed' || trace.status === 'started') {
          group.finalStatus = 'running'
        } else {
          group.finalStatus = trace.status
        }
      } else {
        // 既不是 pre 也不是 post 的 trace
        // 如果这个 group 有 pre stage，则忽略（等待 post stage）
        // 如果没有 pre stage，则直接使用其状态（如 tool-* skill）
        if (!groupHasPreStage) {
          group.finalStatus = trace.status
        }
        // 如果有 pre stage，保持当前状态不变（running 或 pending）
      }
    })

    // 处理 tool-call traces：按 skillName 分组，创建独立的 tool-call 组
    const toolCallGroups = new Map()
    traces.filter(t => t && t.level === 'tool-call').forEach(trace => {
      const skillName = trace.skillName || 'unknown'
      if (!toolCallGroups.has(skillName)) {
        toolCallGroups.set(skillName, {
          groupKey: `toolcall-${skillName}`,
          groupId: skillName,
          displayName: skillName,
          level: 'tool-call',
          traces: [],
          startTime: null,
          endTime: null,
          finalStatus: 'pending'
        })
      }
      const group = toolCallGroups.get(skillName)
      group.traces.push(trace)

      const traceTime = new Date(trace.timestamp || trace.startedAt).getTime()
      if (!group.startTime || traceTime < group.startTime) {
        group.startTime = traceTime
      }
      if (!group.endTime || traceTime > group.endTime) {
        group.endTime = traceTime
      }

      // 更新状态 - tool-call 使用部分成功逻辑
      if (trace.status === 'failed') {
        group.finalStatus = 'failed'
      } else if (trace.status === 'completed') {
        // 如果之前是 failed，保持 failed；否则设为 completed
        if (group.finalStatus !== 'failed') {
          group.finalStatus = 'completed'
        }
      } else if (trace.status === 'running' && group.finalStatus === 'pending') {
        group.finalStatus = 'running'
      }
    })

    // 修正 tool-call 组的状态：如果既有成功又有失败，使用 partial
    toolCallGroups.forEach(group => {
      const hasFailed = group.traces.some(t => t.status === 'failed')
      const hasCompleted = group.traces.some(t => t.status === 'completed')

      if (hasFailed && hasCompleted) {
        group.finalStatus = 'partial'
      }
    })

    // 将 tool-call groups 作为独立组添加到主 groups（不添加到父 skill）
    toolCallGroups.forEach(group => {
      groups.set(group.groupKey, group)
    })

    return Array.from(groups.values()).sort((a, b) => a.startTime - b.startTime)
  }

  const groupedTraces = groupTraces(traces)

  // 统计信息
  const stats = {
    total: traces.length,
    groups: groupedTraces.length,
    task: groupedTraces.filter(g => g.level === 'task').length,
    agent: groupedTraces.filter(g => g.level === 'agent').length,
    skill: groupedTraces.filter(g => g.level === 'skill').length,
    workflowStep: groupedTraces.filter(g => g.level === 'workflow-step').length,
    completed: groupedTraces.filter(g => g.finalStatus === 'completed').length,
    failed: groupedTraces.filter(g => g.finalStatus === 'failed').length,
    running: groupedTraces.filter(g => g.finalStatus === 'running' || g.finalStatus === 'started').length,
  }

  const getStatusConfig = (status) => {
    const configs = {
      completed: { color: '#10B981', bgColor: '#D1FAE5', label: '已完成' },
      failed: { color: '#EF4444', bgColor: '#FEE2E2', label: '失败' },
      running: { color: '#3B82F6', bgColor: '#DBEAFE', label: '运行中' },
      started: { color: '#3B82F6', bgColor: '#DBEAFE', label: '已启动' },
      pending: { color: '#6B7280', bgColor: '#E5E7EB', label: '等待中' },
      partial: { color: '#F59E0B', bgColor: '#FEF3C7', label: '部分成功' }
    }
    return configs[status] || configs.pending
  }

  const getLevelIcon = (level) => {
    switch (level) {
      case 'task':
        return (
          <svg className="level-icon" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      case 'workflow-step':
        return (
          <svg className="level-icon" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      case 'tool-call':
        return (
          <svg className="level-icon" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      case 'agent':
        return (
          <svg className="level-icon" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <circle cx="8" cy="16" r="1" fill="#10B981"/>
            <circle cx="16" cy="16" r="1" fill="#10B981"/>
            <path d="M8 8l-4 4"/>
            <path d="M16 8l4 4"/>
            <circle cx="5" cy="5" r="1"/>
            <circle cx="19" cy="5" r="1"/>
          </svg>
        )
      case 'skill':
        return (
          <svg className="level-icon" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/>
          </svg>
        )
      default:
        return null
    }
  }

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getDataFormat = (data) => {
    if (typeof data === 'string') return 'String'
    if (!data) return 'Empty'

    // 检查特殊结构
    if (data.result_type === 'table') return 'Table'
    if (data.success !== undefined) return 'Result'

    // 检查数组
    if (Array.isArray(data)) return 'Array'

    // 检查对象
    if (typeof data === 'object') {
      if (data.content?.columns && data.content?.rows) return 'Table'
      if (data.content?.headers && data.content?.rows) return 'Table'
      return 'JSON'
    }

    return 'Unknown'
  }

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      console.log(`[ExecutionTracesInline] Copied ${label} to clipboard`)
      // Show copied feedback
      setCopiedField(label)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('[ExecutionTracesInline] Failed to copy:', err)
      // 降级方案：使用传统方法
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        console.log(`[ExecutionTracesInline] Copied ${label} to clipboard (fallback)`)
        // Show copied feedback
        setCopiedField(label)
        setTimeout(() => setCopiedField(null), 2000)
      } catch (e) {
        console.error('[ExecutionTracesInline] Fallback copy also failed:', e)
      }
      document.body.removeChild(textArea)
    }
  }

  return (
    <div className="traces-container">
      {/* 统计摘要卡片 */}
      <div className="stats-card">
        <div className="stats-header">
          <h3 className="stats-title">执行追踪</h3>
          <span className="stat-badge stat-primary">{stats.groups} 组</span>
          <span className="stat-divider">•</span>
          <span className="stat-text">{stats.total} 条记录</span>
          <span className="stat-divider">•</span>
          <div className="stat-item">
            <span className="stat-label">Task</span>
            <span className="stat-value">{stats.task}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Agent</span>
            <span className="stat-value">{stats.agent}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Skill</span>
            <span className="stat-value">{stats.skill}</span>
          </div>
          {stats.workflowStep > 0 && (
            <div className="stat-item">
              <span className="stat-label">Step</span>
              <span className="stat-value">{stats.workflowStep}</span>
            </div>
          )}
          <span className="stat-divider-vertical"></span>
          <div className={`stat-item ${stats.completed > 0 ? 'stat-success' : ''}`}>
            <span className="stat-label">完成</span>
            <span className="stat-value">{stats.completed}</span>
          </div>
          {stats.running > 0 && (
            <div className="stat-item stat-running">
              <span className="stat-label">运行中</span>
              <span className="stat-value">{stats.running}</span>
            </div>
          )}
          {stats.failed > 0 && (
            <div className="stat-item stat-error">
              <span className="stat-label">失败</span>
              <span className="stat-value">{stats.failed}</span>
            </div>
          )}
        </div>
      </div>

      {/* 追踪列表 */}
      <div className="traces-list">
        {groupedTraces.map((group) => {
          const totalDuration = group.endTime && group.startTime
            ? group.endTime - group.startTime
            : null
          const statusConfig = getStatusConfig(group.finalStatus)
          const isExpanded = expandedGroups.has(group.groupKey)

          const sortedTraces = [...group.traces].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.startedAt).getTime()
            const timeB = new Date(b.timestamp || b.startedAt).getTime()
            return timeA - timeB
          })

          return (
            <div
              key={group.groupKey}
              className={`trace-card ${isExpanded ? 'expanded' : ''}`}
            >
              {/* 卡片头部 - 可点击展开/收起 */}
              <div
                className="trace-card-header"
                onClick={() => toggleGroup(group.groupKey)}
              >
                <div className="trace-header-left">
                  <div className="level-badge level-badge-${group.level}">
                    {getLevelIcon(group.level)}
                    <span>{group.level}</span>
                  </div>
                  <span className="trace-name">{group.displayName}</span>
                  <span className="trace-count-badge">{group.traces.length}</span>
                </div>

                <div className="trace-header-right">
                  <span className={`trace-status-badge trace-status-${group.finalStatus}`}>
                    {statusConfig.label}
                  </span>
                  {totalDuration && (
                    <span className="trace-duration">{formatDuration(totalDuration)}</span>
                  )}
                  <svg
                    className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0l10 10a1 1 0 001.414 1.414l-10-10a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </div>
              </div>

              {/* 可折叠的追踪详情 */}
              <div className={`trace-card-body ${isExpanded ? 'visible' : ''}`}>
                <div className="trace-timeline">
                  {sortedTraces.map((trace, index) => {
                    const uniqueId = trace.traceId || trace.id || Math.random().toString(36).substr(2, 9)
                    const stageLabel = trace.stage || (
                      trace.traceId?.includes('-pre') ? 'pre' :
                      trace.traceId?.includes('-post') ? 'post' : ''
                    )
                    const isLast = index === sortedTraces.length - 1

                    return (
                      <div key={uniqueId} className="trace-timeline-item">
                        {/* 时间线节点 */}
                        <div className="timeline-node">
                          <div className={`timeline-dot timeline-dot-${trace.status}`}></div>
                          {!isLast && <div className="timeline-line"></div>}
                        </div>

                        {/* 追踪内容 */}
                        <div className={`trace-content ${trace.isRetry ? 'trace-retry' : ''}`}>
                          <div className="trace-meta">
                            <span className={`trace-stage-badge stage-${stageLabel}`}>
                              {stageLabel}
                              {trace.purpose && ` - ${trace.purpose}`}
                            </span>
                            {trace.isRetry && (
                              <span className="trace-retry-badge" title={`第 ${trace.retryAttempt || 0} 次重试`}>
                                重试 #{trace.retryAttempt || 0}
                              </span>
                            )}
                            {trace.timestamp && (
                              <span className="trace-timestamp">
                                {new Date(trace.timestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  fractionalSecondDigits: 3
                                })}
                              </span>
                            )}
                            {(trace.inputData || trace.outputData || trace.error || trace.errorData || trace.metadata) && (
                              <button
                                className={`trace-details-toggle ${expandedDetails.has(uniqueId) ? 'collapsed' : ''}`}
                                onClick={() => toggleDetail(uniqueId)}
                              >
                                {expandedDetails.has(uniqueId) ? '收起' : '查看数据'}
                              </button>
                            )}
                          </div>

                          {/* 数据详情 */}
                          {expandedDetails.has(uniqueId) && (trace.inputData || trace.outputData || trace.error || trace.errorData || trace.metadata) && (
                            <div className="trace-details-content">
                              {trace.inputData && (
                                <div className="data-block">
                                  <div className="data-block-header">
                                    <div className="data-block-title">
                                      <span>输入数据</span>
                                      <button
                                        className={`copy-icon-button ${copiedField === 'Input' ? 'copied' : ''}`}
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
                                            <span className="copy-feedback-text">已复制</span>
                                          </>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <span className="data-type-badge">{getDataFormat(trace.inputData)}</span>
                                  </div>
                                  <pre className="data-content">{typeof trace.inputData === 'string'
                                    ? trace.inputData
                                    : JSON.stringify(trace.inputData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {trace.outputData && (
                                <div className="data-block">
                                  <div className="data-block-header">
                                    <div className="data-block-title">
                                      <span>输出数据</span>
                                      <button
                                        className={`copy-icon-button ${copiedField === 'Output' ? 'copied' : ''}`}
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
                                            <span className="copy-feedback-text">已复制</span>
                                          </>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <span className="data-type-badge">{getDataFormat(trace.outputData)}</span>
                                  </div>
                                  <pre className="data-content">{typeof trace.outputData === 'string'
                                    ? trace.outputData
                                    : JSON.stringify(trace.outputData, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {(trace.error || trace.errorData) && (
                                <div className="data-block data-error">
                                  <div className="data-block-header">
                                    <div className="data-block-title">
                                      <span>错误信息</span>
                                      <button
                                        className={`copy-icon-button ${copiedField === 'Error' ? 'copied' : ''}`}
                                        onClick={() => copyToClipboard(
                                          typeof trace.error === 'string' ? trace.error :
                                          typeof trace.errorData === 'string' ? trace.errorData :
                                          JSON.stringify(trace.errorData || trace.error, null, 2),
                                          'Error'
                                        )}
                                        title="复制错误信息"
                                      >
                                        {copiedField === 'Error' ? (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                                              <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            <span className="copy-feedback-text">已复制</span>
                                          </>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <span className="data-type-badge">String</span>
                                  </div>
                                  <pre className="data-content">{typeof trace.error === 'string' ? trace.error :
                                         typeof trace.errorData === 'string' ? trace.errorData :
                                         JSON.stringify(trace.errorData || trace.error, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {trace.metadata && (
                                <div className="data-block">
                                  <div className="data-block-header">
                                    <div className="data-block-title">
                                      <span>元数据</span>
                                      <button
                                        className={`copy-icon-button ${copiedField === 'Metadata' ? 'copied' : ''}`}
                                        onClick={() => copyToClipboard(
                                          JSON.stringify(trace.metadata, null, 2),
                                          'Metadata'
                                        )}
                                        title="复制元数据"
                                      >
                                        {copiedField === 'Metadata' ? (
                                          <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                                              <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            <span className="copy-feedback-text">已复制</span>
                                          </>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <span className="data-type-badge">JSON</span>
                                  </div>
                                  <pre className="data-content">{JSON.stringify(trace.metadata, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="traces-loading-state">
          <div className="loading-spinner"></div>
          <span>加载追踪数据...</span>
        </div>
      )}
    </div>
  )
}

export default ExecutionTracesInline
