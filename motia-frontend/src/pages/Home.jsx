import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { systemAPI, tasksAPI, skillsAPI, agentsAPI } from '../services/api'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [systemInfo, setSystemInfo] = useState(null)
  const [recentTasks, setRecentTasks] = useState([])
  const [skills, setSkills] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskContent, setTaskContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [systemRes, tasksRes, skillsRes, agentsRes] = await Promise.all([
          systemAPI.getSystemInfo(),
          tasksAPI.getTasks({ limit: 5 }),
          skillsAPI.getSkills(),
          agentsAPI.getAgents()
        ])

        setSystemInfo(systemRes.data)
        setRecentTasks(tasksRes.data)
        setSkills(skillsRes.data)
        setAgents(agentsRes.data)
      } catch (error) {
        console.error('Error fetching home data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!taskContent.trim()) {
      setError('请输入任务内容')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await tasksAPI.submitTask(taskContent.trim())

      if (response.data && response.data.taskId) {
        // 清空输入框
        setTaskContent('')
        // 跳转到任务详情页
        navigate(`/tasks/${response.data.taskId}`)
      } else {
        setError('任务提交成功，但返回数据格式不正确')
      }
    } catch (error) {
      console.error('Error submitting task:', error)
      setError('任务提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="home">
      {/* 主要任务输入区 */}
      <div className="home-hero">
        <h1>Motia Agent Dashboard</h1>
        <p>输入您的任务，AI将自动处理并返回结果</p>

        <div className="hero-submit-section">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="hero-submit-form">
            <div className="hero-input-group">
              <textarea
                value={taskContent}
                onChange={(e) => setTaskContent(e.target.value)}
                placeholder="请输入您的任务描述，例如：总结这篇文章、生成一张图表、计算 1 + 1 的结果..."
                rows={6}
                className="hero-task-input"
                disabled={submitting}
              />
              <div className="input-hint">
                系统会自动识别任务需求并选择合适的技能来处理
              </div>
            </div>

            <button
              type="submit"
              className="hero-submit-button"
              disabled={submitting || !taskContent.trim()}
            >
              {submitting ? (
                <span className="loading-text">
                  <span className="spinner"></span>
                  提交中...
                </span>
              ) : (
                <>
                  <span className="button-icon">→</span>
                  开始执行任务
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">总任务数</div>
              <div className="stat-value">{systemInfo?.totalTasks || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">完成任务</div>
              <div className="stat-value">{systemInfo?.completedTasks || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">可用技能</div>
              <div className="stat-value">{skills.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">活跃子代理</div>
              <div className="stat-value">{agents.length}</div>
            </div>
          </div>

          {/* 最近任务 */}
          <div className="recent-tasks">
            <h2>最近任务</h2>
            {recentTasks.length > 0 ? (
              <ul className="task-list">
                {recentTasks.map(task => (
                  <li key={task.taskId} className="task-item">
                    <Link to={`/tasks/${task.taskId}`} className="task-link">
                      <div className="task-title">{task.task}</div>
                      <div className="task-meta">
                        <span className={`status status-${task.success ? 'completed' : 'failed'}`}>
                          {task.success ? '成功' : '失败'}
                        </span>
                        <span className="time">
                          {formatDate(task.timestamp)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="no-tasks">暂无任务</div>
            )}
            <Link to="/tasks" className="view-all-link">
              查看所有任务 →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default Home