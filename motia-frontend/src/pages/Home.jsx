import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
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
          tasksAPI.getTasks({ limit: 6 }),
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
      // 生成新的sessionId
      const sessionId = uuidv4()
      const response = await tasksAPI.submitTask(taskContent.trim(), sessionId)

      if (response.data && response.data.taskId) {
        // 保存sessionId到sessionStorage
        sessionStorage.setItem(`sessionId_${response.data.taskId}`, sessionId)

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
      <div className="home-hero-wrapper">
        <div className="container">
          <div className="home-hero">
            <h1>MyAgent Workspace</h1>
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
                  onKeyDown={(e) => {
                    // Cmd+Enter 或 Ctrl+Enter 快捷键提交
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault() // 阻止默认行为
                      e.stopPropagation() // 阻止事件冒泡到表单
                      // 直接触发表单提交，而不是调用 handleSubmit
                      if (taskContent.trim() && !submitting) {
                        e.target.form?.requestSubmit()
                      }
                    }
                  }}
                  placeholder="请输入您的任务描述，例如：总结这篇文章、生成一张图表、计算 1 + 1 的结果... (按 Cmd+Enter 或 Ctrl+Enter 快速提交)"
                  rows={8}
                  className="hero-task-input"
                  disabled={submitting}
                />
                <button
                  type="submit"
                  className="hero-submit-button-icon"
                  disabled={submitting || !taskContent.trim()}
                  title="开始执行任务"
                  aria-label="开始执行任务"
                >
                  {submitting ? (
                    <svg className="submit-icon spinning" width="40" height="40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  ) : (
                    <svg className="submit-icon" width="40" height="40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          {/* 统计卡片区域 */}
          <div className="stats-wrapper">
            <div className="container">
              <div className="stats-section">
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
              </div>
            </div>
          </div>

          {/* 最近任务区域 */}
          <div className="tasks-wrapper">
            <div className="container">
              <div className="tasks-section">
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
                  查看所有任务
                </Link>
              </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Home