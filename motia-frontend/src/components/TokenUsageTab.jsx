import { useState, useEffect } from 'react'
import { tokenUsageAPI } from '../services/api'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import styles from './TokenUsageTab.module.css'

function TokenUsageTab({ taskId }) {
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await tokenUsageAPI.getTaskTokenUsage(taskId)
        setUsage(response.data)
      } catch (err) {
        console.error('Error fetching task token usage:', err)
        if (err.response?.status === 404) {
          setError('该任务暂无 Token 使用记录')
        } else {
          setError('获取用量数据失败，请稍后重试')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUsage()
  }, [taskId])

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hour}:${minute}`
  }

  // Prepare timeline chart data
  const chartData = usage?.timeline?.map((item, index) => ({
    index: index + 1,
    time: formatDate(item.timestamp),
    total: item.llmUsage?.totalTokens || 0,
    prompt: item.llmUsage?.promptTokens || 0,
    completion: item.llmUsage?.completionTokens || 0,
  })) || []

  // Prepare breakdown data
  const breakdownData = usage?.breakdown || { bySkill: [], byModel: [] }

  // Check if summary data exists
  const summary = usage?.summary
  if (!summary) {
    return (
      <div className={styles.tokenUsageTab}>
        {loading ? (
          <div className={styles.tokenUsageLoading}>加载中...</div>
        ) : (
          <div className={styles.tokenUsageEmpty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
            <p>该任务暂无 Token 使用记录</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.tokenUsageTab}>
      {loading ? (
        <div className={styles.tokenUsageLoading}>加载中...</div>
      ) : error ? (
        <div className={styles.tokenUsageError}>{error}</div>
      ) : !usage ? (
        <div className={styles.tokenUsageEmpty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
          <p>该任务暂无 Token 使用记录</p>
        </div>
      ) : (
        <div className={styles.tokenUsageContent}>
          {/* 总览统计 */}
          <div className={styles.usageSummary}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              </div>
              <div className={styles.summaryContent}>
                <div className={styles.summaryLabel}>总 Token</div>
                <div className={styles.summaryValue}>{formatNumber(summary.totalTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.summaryIconPrompt}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v20M2 12h20" />
                </svg>
              </div>
              <div className={styles.summaryContent}>
                <div className={styles.summaryLabel}>Prompt</div>
                <div className={styles.summaryValue}>{formatNumber(summary.promptTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.summaryIconCompletion}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div className={styles.summaryContent}>
                <div className={styles.summaryLabel}>Completion</div>
                <div className={styles.summaryValue}>{formatNumber(summary.completionTokens || 0)}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.summaryIconCalls}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
              </div>
              <div className={styles.summaryContent}>
                <div className={styles.summaryLabel}>LLM 调用次数</div>
                <div className={styles.summaryValue}>{summary.llmCallsCount || 0}</div>
              </div>
            </div>
          </div>

          {/* 时间线图表 */}
          {chartData.length > 0 && (
            <div className={styles.timelineSection}>
              <h3 className={styles.sectionTitle}>Token 使用时间线</h3>
              <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="#64748B"
                      fontSize={11}
                      tick={{ fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tick={{ fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#F8FAFC',
                        fontSize: '11'
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '0.5rem', fontSize: '11' }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#2563EB"
                      name="总Token"
                      strokeWidth={2}
                      dot={{ fill: '#2563EB', strokeWidth: 2, r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 按技能分组 */}
          {breakdownData.bySkill && breakdownData.bySkill.length > 0 && (
            <div className={styles.breakdownSection}>
              <h3 className={styles.sectionTitle}>按技能分组</h3>
              <div className={styles.breakdownList}>
                {[...breakdownData.bySkill].sort((a, b) => b.totalTokens - a.totalTokens).map((item, index) => (
                  <div key={index} className={styles.breakdownItem}>
                    <div className={styles.breakdownHeader}>
                      <span className={styles.breakdownName}>{item.skillName || '未知'}</span>
                      <span className={styles.breakdownTokens}>{formatNumber(item.totalTokens)} tokens</span>
                    </div>
                    <div className={styles.breakdownStats}>
                      <span>{item.llmCallsCount || 0} 次调用</span>
                      <span>{formatNumber(item.promptTokens)} prompt</span>
                      <span>{formatNumber(item.completionTokens)} completion</span>
                    </div>
                    <div className={styles.breakdownBar}>
                      <div
                        className={styles.breakdownBarFill}
                        style={{
                          width: `${(item.totalTokens / (summary.totalTokens || 1)) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 按模型分组 */}
          {breakdownData.byModel && breakdownData.byModel.length > 0 && (
            <div className={styles.breakdownSection}>
              <h3 className={styles.sectionTitle}>按模型分组</h3>
              <div className={styles.breakdownList}>
                {[...breakdownData.byModel].sort((a, b) => b.totalTokens - a.totalTokens).map((item, index) => (
                  <div key={index} className={styles.breakdownItem}>
                    <div className={styles.breakdownHeader}>
                      <span className={styles.breakdownName}>{item.model || '未知模型'}</span>
                      <span className={styles.breakdownTokens}>{formatNumber(item.totalTokens)} tokens</span>
                    </div>
                    <div className={styles.breakdownStats}>
                      <span>{item.llmCallsCount || 0} 次调用</span>
                      <span>{formatNumber(item.promptTokens)} prompt</span>
                      <span>{formatNumber(item.completionTokens)} completion</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TokenUsageTab
