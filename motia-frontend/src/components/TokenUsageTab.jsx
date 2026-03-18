import { useState, useEffect } from 'react'
import { tokenUsageAPI } from '../services/api'
import './TokenUsageTab.css'

function TokenUsageTab({ taskId }) {
  const [tokenData, setTokenData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchTokenUsage = async () => {
      if (!taskId) return

      setLoading(true)
      setError('')

      try {
        const response = await tokenUsageAPI.getTaskTokenUsage(taskId)
        setTokenData(response.data)
      } catch (err) {
        console.error('Error fetching task token usage:', err)
        setError('获取Token用量数据失败')
      } finally {
        setLoading(false)
      }
    }

    fetchTokenUsage()
  }, [taskId])

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num?.toLocaleString() || '0'
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  if (loading) {
    return (
      <div className="token-usage-tab">
        <div className="token-usage-loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="token-usage-tab">
        <div className="token-usage-error">{error}</div>
      </div>
    )
  }

  if (!tokenData) {
    return (
      <div className="token-usage-tab">
        <div className="token-usage-empty">暂无Token用量数据</div>
      </div>
    )
  }

  // Group by skill
  const bySkill = {}
  tokenData.calls?.forEach(call => {
    if (!bySkill[call.skillName]) {
      bySkill[call.skillName] = {
        skillName: call.skillName,
        calls: [],
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0
      }
    }
    bySkill[call.skillName].calls.push(call)
    bySkill[call.skillName].totalTokens += call.totalTokens
    bySkill[call.skillName].promptTokens += call.promptTokens
    bySkill[call.skillName].completionTokens += call.completionTokens
  })

  return (
    <div className="token-usage-tab">
      {/* 总览 */}
      <div className="token-usage-summary">
        <div className="token-usage-summary-card">
          <div className="token-usage-summary-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div className="token-usage-summary-content">
            <div className="token-usage-summary-label">总Token用量</div>
            <div className="token-usage-summary-value">{formatNumber(tokenData.totalTokens)}</div>
          </div>
        </div>

        <div className="token-usage-summary-card">
          <div className="token-usage-summary-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20" />
              <path d="m4.93 4.93 14.14 14.14" />
              <path d="m19.07 4.93-14.14 14.14" />
            </svg>
          </div>
          <div className="token-usage-summary-content">
            <div className="token-usage-summary-label">Prompt Tokens</div>
            <div className="token-usage-summary-value">{formatNumber(tokenData.promptTokens)}</div>
          </div>
        </div>

        <div className="token-usage-summary-card">
          <div className="token-usage-summary-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="token-usage-summary-content">
            <div className="token-usage-summary-label">Completion Tokens</div>
            <div className="token-usage-summary-value">{formatNumber(tokenData.completionTokens)}</div>
          </div>
        </div>

        <div className="token-usage-summary-card">
          <div className="token-usage-summary-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div className="token-usage-summary-content">
            <div className="token-usage-summary-label">LLM调用次数</div>
            <div className="token-usage-summary-value">{tokenData.calls?.length || 0}</div>
          </div>
        </div>
      </div>

      {/* 按技能分组 */}
      {Object.keys(bySkill).length > 0 && (
        <div className="token-usage-by-skill">
          <h3>按技能分组</h3>
          <div className="skill-groups">
            {Object.values(bySkill)
              .sort((a, b) => b.totalTokens - a.totalTokens)
              .map(skill => (
                <div key={skill.skillName} className="skill-group">
                  <div className="skill-group-header">
                    <div className="skill-group-name">{skill.skillName}</div>
                    <div className="skill-group-total">{formatNumber(skill.totalTokens)} tokens</div>
                  </div>

                  <div className="skill-group-calls">
                    {skill.calls.map((call, index) => (
                      <div key={index} className="call-item">
                        <div className="call-header">
                          <div className="call-model">{call.modelName}</div>
                          <div className="call-time">{formatTimestamp(call.timestamp)}</div>
                        </div>
                        <div className="call-metrics">
                          <div className="call-metric">
                            <span className="call-metric-label">Prompt:</span>
                            <span className="call-metric-value">{formatNumber(call.promptTokens)}</span>
                          </div>
                          <div className="call-metric">
                            <span className="call-metric-label">Completion:</span>
                            <span className="call-metric-value">{formatNumber(call.completionTokens)}</span>
                          </div>
                          <div className="call-metric">
                            <span className="call-metric-label">Total:</span>
                            <span className="call-metric-value call-metric-value-total">{formatNumber(call.totalTokens)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 调用时间线 */}
      {tokenData.calls && tokenData.calls.length > 0 && (
        <div className="token-usage-timeline">
          <h3>调用时间线</h3>
          <div className="timeline">
            {tokenData.calls.map((call, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <div className="timeline-skill">{call.skillName}</div>
                    <div className="timeline-time">{formatTimestamp(call.timestamp)}</div>
                  </div>
                  <div className="timeline-model">{call.modelName}</div>
                  <div className="timeline-metrics">
                    <span>Prompt: {formatNumber(call.promptTokens)}</span>
                    <span>Completion: {formatNumber(call.completionTokens)}</span>
                    <span className="timeline-total">Total: {formatNumber(call.totalTokens)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TokenUsageTab
