import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksAPI, agentsAPI } from '../services/api'
import { useStreamGroup, useMotiaStream } from '@motiadev/stream-client-react'

// 使用与 API 配置相同的基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

import './TaskDetail.css'

function TaskDetail() {
  const { id } = useParams()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([]) // 进度流消息
  const [chatMessages, setChatMessages] = useState([]) // 对话消息
  const [inputValue, setInputValue] = useState('') // 聊天输入框内容
  const [retrying, setRetrying] = useState(false) // 重试状态
  const pollIntervalRef = useRef(null) // 使用 ref 来管理 interval
  const completedFetchedRef = useRef(false) // 记录是否已经获取过完成状态的任务详情

  // 获取 stream 实例，避免初始化时的竞态条件
  const { stream } = useMotiaStream()

  // 使用 Motia Stream SDK 获取实时数据（WebSocket 连接，无需轮询）
  // 只在 stream 存在时订阅，避免初始化时的错误警告
  const subscriptionRef = useRef(null)

  useEffect(() => {
    // 如果 stream 或 id 不存在，直接返回
    if (!stream || !id) {
      return
    }

    // 订阅 stream
    subscriptionRef.current = stream.subscribeGroup('taskExecution', id)

    // 监听数据变化
    subscriptionRef.current.addChangeListener((data) => {
      // 处理实时消息
      const entries = Array.isArray(data) ? data : []

      // 更新进度流消息
      setMessages(entries)

      // 过滤出聊天消息
      const chatEntries = entries.filter(entry => entry.type === 'chat')
      setChatMessages(chatEntries)
    })

    // 清理订阅
    return () => {
      subscriptionRef.current?.close()
      subscriptionRef.current = null
      setMessages([])
      setChatMessages([])
    }
  }, [stream, id])

  // 监听 Stream 数据，当检测到任务完成时，重新获取任务详情
  useEffect(() => {
    if (!messages || messages.length === 0 || completedFetchedRef.current) {
      return
    }

    // 查找最后一个 entry
    const lastEntry = messages[messages.length - 1]

    // 如果检测到完成状态，重新获取任务详情
    if (lastEntry?.status === 'completed' || lastEntry?.status === 'failed') {
      console.log('检测到任务状态变化:', lastEntry.status, '，重新获取任务详情')

      // 标记已处理，避免重复请求
      completedFetchedRef.current = true

      // 重新获取任务详情
      const fetchUpdatedDetails = async () => {
        try {
          const updatedTask = await tasksAPI.getTaskDetails(id)
          console.log('已获取更新后的任务详情:', updatedTask)
          setTask(updatedTask)
          setLoading(false)
          setPolling(false)

          // 清除轮询
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (error) {
          console.error('获取更新后的任务详情失败:', error)
        }
      }

      fetchUpdatedDetails()
    }
  }, [messages, id])

  useEffect(() => {
    // 清理之前的 interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    const fetchTaskDetails = async () => {
      try {
        const task = await tasksAPI.getTaskDetails(id)
        setTask(task)
        setError('')
        setLoading(false)
        return { found: true, error: null }
      } catch (error) {
        console.error('Error fetching task details:', error)
        setLoading(false)

        // 处理 404 错误：404 = Not Found，直接停止轮询
        if (error.response?.status === 404) {
          setError('任务不存在')
          return { found: false, error: true, taskNotFound: true }
        }

        // 其他错误
        setError('获取任务详情失败')
        return { found: false, error: true }
      }
    }

    let pollCount = 0
    const maxPolls = 60 // 最多轮询60次（约1分钟）

    const startPolling = async () => {
      setPolling(true)
      pollCount = 0

      const poll = async () => {
        pollCount++
        const result = await fetchTaskDetails()

        // 如果找到任务、出错、任务不存在或达到最大轮询次数，停止轮询
        if (result.found || result.error || result.taskNotFound || pollCount >= maxPolls) {
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          if (result.taskNotFound) {
            // 任务不存在，停止轮询，不设置额外错误
            console.log('任务不存在，停止轮询')
          } else if (result.error && !result.taskNotFound) {
            setError('获取任务详情失败')
          } else if (!result.found && pollCount >= maxPolls) {
            setError('任务执行超时，请稍后刷新页面重试')
          }
        }
      }

      // 立即执行一次
      await poll()

      // 如果还没找到、没有错误、且任务不是不存在，开始轮询
      if (pollCount < maxPolls && !error && !task && !polling) {
        pollIntervalRef.current = setInterval(poll, 1000) // 每秒轮询一次
      }
    }

    startPolling()

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [id])

  // 发送对话消息
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    const userMessage = {
      type: 'chat',
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
      id: Date.now().toString() // 临时ID
    }

    // 立即显示在UI上（乐观更新）
    setMessages(prev => [...prev, userMessage])
    setChatMessages(prev => [...prev, userMessage])

    // 发送到后端
    try {
      await agentsAPI.sendChatMessage(id, inputValue)
    } catch (error) {
      console.error('发送消息失败:', error)
      alert('发送消息失败，请重试')
    } finally {
      setInputValue('')
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const formatDuration = (milliseconds) => {
    if (!milliseconds) return '-'
    // 将毫秒转换为秒
    const totalSeconds = Math.floor(milliseconds / 1000)

    if (totalSeconds < 60) return `${totalSeconds}秒`
    if (totalSeconds < 3600) {
      const mins = Math.floor(totalSeconds / 60)
      const secs = totalSeconds % 60
      return `${mins}分${secs}秒`
    }
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return `${hours}小时${mins}分${secs}秒`
  }

  // 消息气泡组件
  const MessageBubble = ({ message }) => {
    const styles = {
      status: 'status-message',
      step: 'step-message',
      heartbeat: 'heartbeat-message',
      chat: 'chat-message',
    }

    return (
      <div className={`${styles[message.type || 'status']} message`}>
        <span className="timestamp">{new Date(message.timestamp).toLocaleTimeString()}</span>
        <span className="content">{message.message || message.content}</span>
        {message.skill && <span className="badge">{message.skill}</span>}
      </div>
    )
  }

  // 聊天气泡组件
  const ChatBubble = ({ message }) => {
    const isUser = message.role === 'user'
    return (
      <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="chat-avatar">
          {isUser ? '👤' : '🤖'}
        </div>
        <div className="chat-content">
          <div className="chat-message">{message.content}</div>
          <div className="chat-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    )
  }

  const handleDeleteTask = async () => {
    // ⭐ 停止轮询，防止在删除过程中显示 404 错误
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setPolling(false)

    // 确认删除
    if (!window.confirm(`确定要删除任务 ${task.taskId} 吗?此操作不可恢复。`)) {
      // 用户取消删除，恢复轮询
      setPolling(true)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (err) {
          console.error('轮询失败:', err)
        }
      }, 1000)
      return
    }

    try {
      console.log('=== 开始删除任务 ===')
      console.log('任务 ID:', task.taskId)

      const response = await tasksAPI.deleteTask(task.taskId)

      console.log('=== 删除成功 ===')
      console.log('响应对象:', response)
      console.log('响应数据:', response.data)
      console.log('响应状态:', response.status)

      // 删除成功后跳转回任务列表
      window.location.href = '/tasks'
    } catch (error) {
      console.error('=== 删除任务失败 ===')
      console.error('完整错误对象:', error)
      console.error('错误名称:', error.name)
      console.error('错误消息:', error.message)
      console.error('错误堆栈:', error.stack)

      if (error.response) {
        console.error('HTTP 状态码:', error.response.status)
        console.error('HTTP 状态文本:', error.response.statusText)
        console.error('响应头:', error.response.headers)
        console.error('响应数据:', error.response.data)
      } else if (error.request) {
        console.error('请求已发送但没有收到响应:', error.request)
      } else {
        console.error('请求设置错误:', error.message)
      }

      // 显示更详细的错误信息
      let errorMessage = '未知错误'

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.message) {
        errorMessage = error.message
      }

      alert(`删除任务失败: ${errorMessage}\n请查看浏览器控制台获取详细信息`)

      // 删除失败，恢复轮询
      setPolling(true)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (err) {
          console.error('轮询失败:', err)
        }
      }, 1000)
    }
  }

  const handleRetryTask = async () => {
    if (retrying) return

    if (!window.confirm(`确定要重试任务 ${task.taskId} 吗?`)) {
      return
    }

    setRetrying(true)
    try {
      await tasksAPI.retryTask(task.taskId)

      // 重置完成标记，以便新的任务执行完成时可以再次触发自动获取
      completedFetchedRef.current = false

      // 重试成功，显示提示并保持当前页面状态
      alert('任务重试已启动，页面将自动更新')

      // 重新开始轮询任务状态
      setLoading(true)
      setPolling(true)
      setRetrying(false)

      // 使用现有的轮询逻辑，不再手动 reload
      // useEffect 会自动处理轮询
      const fetchTaskDetails = async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setError('')
          setLoading(false)
          setPolling(false)
        } catch (error) {
          console.error('Error fetching task details:', error)
          if (error.response?.status === 404) {
            // 404 表示任务还在执行中，继续轮询
            setTimeout(fetchTaskDetails, 1000)
          } else {
            setError('获取任务详情失败')
            setLoading(false)
            setPolling(false)
          }
        }
      }

      fetchTaskDetails()
    } catch (error) {
      console.error('重试失败:', error)
      const errorMessage = error.response?.data?.message || '重试失败，请稍后重试'
      alert(errorMessage)
      setRetrying(false)
    }
  }

  if (loading || polling) {
    return (
      <div className="task-detail">
        <div className="loading">
          {polling ? (
            <div className="polling-status">
              <span className="spinner"></span>
              <span>任务执行中，请稍候...</span>
            </div>
          ) : (
            '加载中...'
          )}
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="task-detail">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="error">任务不存在</div>
        )}
      </div>
    )
  }

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <Link to="/tasks" className="back-link">
          ← 返回任务列表
        </Link>
        <div className="header-title-action">
          <h1>任务详情</h1>
          <button
            className="delete-button-detail"
            onClick={handleDeleteTask}
            title="删除任务"
            aria-label="删除任务"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* 任务信息 */}
      <div className="task-info">
        <div className="info-section">
          <h2>基本信息</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">任务 ID:</span>
              <span className="info-value">{task.taskId}</span>
            </div>
            <div className="info-item">
              <span className="info-label">状态:</span>
              <div className="info-value-with-action">
                <span className={`info-value status status-${task.executionTime === null ? (task.status === 'started' ? 'started' : 'running') : (task.success ? 'completed' : 'failed')}`}>
                  {task.executionTime === null ? (task.status === 'started' ? '已开始' : '执行中') : (task.success ? '成功' : '失败')}
                </span>
                {task.executionTime !== null && !task.success && (
                  <button
                    className="retry-button"
                    onClick={handleRetryTask}
                    disabled={retrying}
                    title="重新执行此任务"
                    aria-label="重新执行此任务"
                  >
                    {retrying ? (
                      <svg className="retry-icon spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                      </svg>
                    ) : (
                      <svg className="retry-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">创建时间:</span>
              <span className="info-value">{formatDate(task.timestamp)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">执行时间:</span>
              <span className="info-value">{formatDuration(task.executionTime)}</span>
            </div>
            {task.metadata?.skillNames && task.metadata.skillNames.length > 0 && (
              <div className="info-item">
                <span className="info-label">技能:</span>
                <div className="skill-badges">
                  {task.metadata.skillNames.map((skill, index) => (
                    <span key={index} className="skill-badge">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {task.metadata?.delegates && task.metadata.delegates.length > 0 && (
              <div className="info-item">
                <span className="info-label">委派给:</span>
                <div className="delegate-badges">
                  {task.metadata.delegates.map((delegate, index) => (
                    <span key={index} className="delegate-badge">
                      🤖 {delegate}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 任务内容 */}
        <div className="info-section">
          <h2>任务内容</h2>
          <div className="task-content">
            <pre>{task.task}</pre>
          </div>
        </div>
      </div>

      {/* 混合UI区域：左侧进度流 + 底部对话区 */}
      <div className="hybrid-ui-container">
        {/* 左侧进度流区域 */}
        <div className="progress-stream">
          <div className="progress-stream-header">
            <h3>任务执行进度</h3>
            <span className="stream-count">{messages.length} 条消息</span>
          </div>
          <div className="progress-stream-content">
            {messages.map(msg => (
              <MessageBubble key={msg.id || msg.timestamp} message={msg} />
            ))}
            {messages.length === 0 && (
              <div className="no-progress-data">
                <p>暂无任务执行数据</p>
                <p className="hint">任务执行时会显示实时进度信息</p>
              </div>
            )}
          </div>
        </div>

        {/* 底部对话区域 */}
        <div className="chat-area">
          <div className="chat-messages">
            {chatMessages.map(msg => (
              <ChatBubble key={msg.id || msg.timestamp} message={msg} />
            ))}
            {chatMessages.length === 0 && (
              <div className="no-chat-data">
                <p>开始与任务进行对话</p>
                <p className="hint">输入问题或指令，获取实时反馈</p>
              </div>
            )}
          </div>

          <div className="chat-input">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="输入问题或指令..."
              disabled={!task}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || !task}
              title="发送消息"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskDetail
