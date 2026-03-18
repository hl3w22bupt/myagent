import { useState, useEffect } from 'react'
import { tokenUsageAPI } from '../services/api'
import './Analytics.css'

function Analytics() {
  const [timeRange, setTimeRange] = useState('24h')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await tokenUsageAPI.getSummary(timeRange)
        setSummary(response.data)
      } catch (err) {
        console.error('Error fetching token usage summary:', err)
        setError('获取用量数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [timeRange])

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }

  const timeRangeOptions = [
    { value: '1h', label: '1小时' },
    { value: '24h', label: '24小时' },
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' }
  ]

  return (
    <div className="analytics">
      <div className="container">
        <div className="analytics-header">
          <h1>用量分析</h1>
          <div className="time-range-selector">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                className={`time-range-button ${timeRange === option.value ? 'active' : ''}`}
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : summary ? (
          <div className="analytics-content">
            {/* 总览卡片 */}
            <div className="summary-cards">
              <div className="summary-card">
                <div className="summary-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div className="summary-card-content">
                  <div className="summary-card-label">总Token用量</div>
                  <div className="summary-card-value">{formatNumber(summary.totalTokens || 0)}</div>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M2 12h20" />
                    <path d="m4.93 4.93 14.14 14.14" />
                    <path d="m19.07 4.93-14.14 14.14" />
                  </svg>
                </div>
                <div className="summary-card-content">
                  <div className="summary-card-label">Prompt Tokens</div>
                  <div className="summary-card-value">{formatNumber(summary.promptTokens || 0)}</div>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div className="summary-card-content">
                  <div className="summary-card-label">Completion Tokens</div>
                  <div className="summary-card-value">{formatNumber(summary.completionTokens || 0)}</div>
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                </div>
                <div className="summary-card-content">
                  <div className="summary-card-label">任务数量</div>
                  <div className="summary-card-value">{summary.taskCount || 0}</div>
                </div>
              </div>
            </div>

            {/* 详细统计 */}
            <div className="details-section">
              <h2>详细统计</h2>
              <div className="details-grid">
                <div className="detail-item">
                  <div className="detail-label">平均每任务 Token 用量</div>
                  <div className="detail-value">
                    {summary.taskCount > 0
                      ? formatNumber(Math.round(summary.totalTokens / summary.taskCount))
                      : '0'}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">Prompt 占比</div>
                  <div className="detail-value">
                    {summary.totalTokens > 0
                      ? `${((summary.promptTokens / summary.totalTokens) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">Completion 占比</div>
                  <div className="detail-value">
                    {summary.totalTokens > 0
                      ? `${((summary.completionTokens / summary.totalTokens) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>
              </div>
            </div>

            {/* 技能统计 */}
            {summary.bySkill && Object.keys(summary.bySkill).length > 0 && (
              <div className="skills-section">
                <h2>技能用量统计</h2>
                <div className="skills-list">
                  {Object.entries(summary.bySkill)
                    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                    .slice(0, 10)
                    .map(([skillName, data]) => (
                      <div key={skillName} className="skill-item">
                        <div className="skill-info">
                          <div className="skill-name">{skillName}</div>
                          <div className="skill-tokens">{formatNumber(data.totalTokens)} tokens</div>
                        </div>
                        <div className="skill-bar">
                          <div
                            className="skill-bar-fill"
                            style={{
                              width: `${(data.totalTokens / summary.totalTokens) * 100}%`
                            }}
                          />
                        </div>
                        <div className="skill-details">
                          <span>任务数: {data.taskCount}</span>
                          <span>Prompt: {formatNumber(data.promptTokens)}</span>
                          <span>Completion: {formatNumber(data.completionTokens)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Analytics
