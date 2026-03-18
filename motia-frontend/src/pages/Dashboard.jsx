import { useState, useEffect } from 'react'
import { tokenUsageAPI } from '../services/api'
import styles from './Dashboard.module.css'

function Dashboard() {
  const [timeRange, setTimeRange] = useState('30d')
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
    { value: '24h', label: '24小时' },
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' }
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>用量统计</h1>
        <div className={styles.timeRangeSelector}>
          {timeRangeOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.timeRangeButton} ${timeRange === option.value ? styles.timeRangeButtonActive : ''}`}
              onClick={() => setTimeRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : error ? (
        <div className={styles.errorMessage}>{error}</div>
      ) : summary ? (
        <div className={styles.content}>
          {/* 总览卡片 */}
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <div className={styles.summaryCardContent}>
                <div className={styles.summaryCardLabel}>总Token用量</div>
                <div className={styles.summaryCardValue}>{formatNumber(summary.totalTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M2 12h20" />
                  <path d="m4.93 4.93 14.14 14.14" />
                  <path d="m19.07 4.93-14.14 14.14" />
                </svg>
              </div>
              <div className={styles.summaryCardContent}>
                <div className={styles.summaryCardLabel}>Prompt Tokens</div>
                <div className={styles.summaryCardValue}>{formatNumber(summary.promptTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div className={styles.summaryCardContent}>
                <div className={styles.summaryCardLabel}>Completion Tokens</div>
                <div className={styles.summaryCardValue}>{formatNumber(summary.completionTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h.01M12 9h.01M15 12h.01M12 15h.01M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0a9 9 0 1 0-9-9 9 9 0 0 0 9 9" />
                </svg>
              </div>
              <div className={styles.summaryCardContent}>
                <div className={styles.summaryCardLabel}>平均 Token/任务</div>
                <div className={styles.summaryCardValue}>{formatNumber(Math.round((summary.totalTokens || 0) / (summary.taskCount || 1)))}</div>
              </div>
            </div>
          </div>

          {/* 详细统计 */}
          {summary.topSkills && summary.topSkills.length > 0 && (
            <div className={styles.skillsSection}>
              <h2 className={styles.sectionTitle}>Top 10 技能用量</h2>
              <div className={styles.skillsList}>
                {summary.topSkills.map((skill, index) => {
                  const maxTokens = summary.topSkills[0].totalTokens
                  const percentage = maxTokens > 0 ? (skill.totalTokens / maxTokens) * 100 : 0

                  return (
                    <div key={index} className={styles.skillItem}>
                      <div className={styles.skillInfo}>
                        <span className={styles.skillName}>{skill.skillName || 'Unknown'}</span>
                        <span className={styles.skillTokens}>{formatNumber(skill.totalTokens)} tokens</span>
                      </div>
                      <div className={styles.skillBar}>
                        <div
                          className={styles.skillBarFill}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className={styles.skillDetails}>
                        <span>{skill.llmCallsCount || 0} 次调用</span>
                        <span>{formatNumber(skill.promptTokens || 0)} prompt</span>
                        <span>{formatNumber(skill.completionTokens || 0)} completion</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default Dashboard
