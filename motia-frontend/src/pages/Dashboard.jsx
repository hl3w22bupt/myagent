import { useState, useEffect } from 'react'
import { tokenUsageAPI } from '../services/api'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import styles from './Dashboard.module.css'

function Dashboard() {
  const [timeRange, setTimeRange] = useState('30d')
  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')

      try {
        // Fetch summary and trends in parallel
        const [summaryResponse, trendsResponse] = await Promise.all([
          tokenUsageAPI.getSummary(timeRange),
          tokenUsageAPI.getTrends(timeRange)
        ])

        setSummary(summaryResponse.data.data)
        setTrends(trendsResponse.data.data.trends || [])
      } catch (err) {
        console.error('Error fetching token usage data:', err)
        setError('获取用量数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [timeRange])

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}-${day}`
  }

  const formatHour = (timestamp) => {
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    return `${month}-${day} ${hour}:00`
  }

  // Prepare chart data
  const chartData = trends.map(trend => ({
    ...trend,
    date: timeRange === '24h' ? formatHour(trend.timestamp) : formatDate(trend.timestamp)
  }))

  const timeRangeOptions = [
    { value: '24h', label: '24小时' },
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' }
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Token用量统计</h1>
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
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
              </div>
              <div className={styles.summaryCardContent}>
                <div className={styles.summaryCardLabel}>平均 Token/任务</div>
                <div className={styles.summaryCardValue}>{formatNumber(Math.round((summary.totalTokens || 0) / (summary.taskCount || 1)))}</div>
              </div>
            </div>
          </div>

          {/* 趋势图表 */}
          {trends.length > 0 && (
            <div className={styles.trendsSection}>
              <h2 className={styles.sectionTitle}>Token 使用趋势</h2>

              {/* Charts Row - 总Token趋势 and Prompt vs Completion */}
              <div className={styles.chartsRow}>
                {/* 折线图 - 总Token趋势 */}
                <div className={styles.chartContainer}>
                  <h3 className={styles.chartTitle}>总Token使用趋势</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#64748B"
                        fontSize={12}
                        tick={{ fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#64748B"
                        fontSize={12}
                        tick={{ fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#F8FAFC',
                          fontSize: '12',
                          fontFamily: 'DM Sans, sans-serif'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalTokens"
                        stroke="#2563EB"
                        name="总Token"
                        strokeWidth={2.5}
                        dot={{ fill: '#2563EB', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#2563EB', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 柱状图 - Prompt vs Completion */}
                <div className={styles.chartContainer}>
                  <h3 className={styles.chartTitle}>Prompt vs Completion Token</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#64748B"
                        fontSize={12}
                        tick={{ fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#64748B"
                        fontSize={12}
                        tick={{ fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#F8FAFC',
                          fontSize: '12',
                          fontFamily: 'DM Sans, sans-serif'
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: '1rem',
                          fontSize: '12',
                          fontFamily: 'DM Sans, sans-serif'
                        }}
                      />
                      <Bar
                        dataKey="promptTokens"
                        fill="#2563EB"
                        name="Prompt Tokens"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="completionTokens"
                        fill="#F97316"
                        name="Completion Tokens"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

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
