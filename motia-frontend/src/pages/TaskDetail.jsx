import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksAPI } from '../services/api'
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
  const [activeTab, setActiveTab] = useState('visual') // 'visual' or 'text' or 'stream'
  const [mediaUrls, setMediaUrls] = useState({}) // Cache for blob URLs
  const [retrying, setRetrying] = useState(false) // 重试状态
  const pollIntervalRef = useRef(null) // 使用 ref 来管理 interval
  const completedFetchedRef = useRef(false) // 记录是否已经获取过完成状态的任务详情

  // 获取 stream 实例，避免初始化时的竞态条件
  const { stream } = useMotiaStream()

  // 使用 Motia Stream SDK 获取实时数据（WebSocket 连接，无需轮询）
  // 只在 stream 存在时订阅，避免初始化时的错误警告
  // 需要直接在组件内部处理，因为 useStreamGroup 内部会处理 args || {}
  const [streamData, setStreamData] = useState([])
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
      setStreamData(data)
    })

    // 清理订阅
    return () => {
      subscriptionRef.current?.close()
      subscriptionRef.current = null
      setStreamData([])
    }
  }, [stream, id])

  // 监听 Stream 数据，当检测到任务完成时，重新获取任务详情
  useEffect(() => {
    if (!streamData || streamData.length === 0 || completedFetchedRef.current) {
      return
    }

    // 查找最后一个 entry
    const lastEntry = streamData[streamData.length - 1]

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
  }, [streamData, id])

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

  // 检测结果类型
  const getResultType = (result) => {
    if (!result) return 'text'

    // 如果是字符串，尝试检测URL或路径
    if (typeof result === 'string') {
      // 尝试解析字符串中的URL
      const urlMatch = result.match(/(?:png_url|video_url|html_url|svg_url)['":\s]*['"]([^'"]+)['"]/)
      if (urlMatch) {
        const url = urlMatch[1]
        if (url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')) {
          return 'video'
        }
        if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.gif') || url.includes('.svg')) {
          return 'image'
        }
      }

      // 检测视频路径
      if (result.includes('.mp4') || result.includes('.webm') || result.includes('.mov')) {
        return 'video'
      }
      // 检测图片路径
      if (result.includes('.png') || result.includes('.jpg') || result.includes('.jpeg') || result.includes('.gif') || result.includes('.svg')) {
        return 'image'
      }
      return 'text'
    }

    // 如果是对象，检查result_type字段
    if (typeof result === 'object') {
      const resultType = result.result_type || result.type

      // 统一结果格式
      if (resultType === 'video') return 'video'
      if (resultType === 'infographic') return 'image'
      if (resultType === 'table') return 'table'
      if (resultType === 'text') return 'text'

      // 检查content字段
      if (result.content) {
        const { path, mime_type } = result.content
        if (path) {
          if (path.includes('.mp4') || path.includes('.webm') || mime_type?.startsWith('video/')) {
            return 'video'
          }
          if (path.includes('.png') || path.includes('.jpg') || mime_type?.startsWith('image/')) {
            return 'image'
          }
        }
      }
    }

    return 'text'
  }

  // 从output字符串中提取URL和统一结果
  const extractParsedResult = (result) => {
    // 如果已经是对象格式（统一结果格式）
    if (typeof result === 'object' && result.result_type && result.content) {
      return result
    }

    // 如果是字符串，尝试解析
    if (typeof result === 'string') {
      // 方法1: 直接匹配 'result_type': 'video', 'content': {'path': '...'
      const typeMatch = result.match(/'result_type':\s*'(video|infographic|image|table|text)'/)
      const pathMatch = result.match(/'path':\s*'([^']+\.(?:mp4|png|jpg|jpeg|gif|svg|webm|mov))'/)

      if (typeMatch && pathMatch) {
        const resultType = typeMatch[1]
        const path = pathMatch[1]

        // 提取其他元数据
        const durationMatch = result.match(/'duration':\s*([\d.]+)/)
        const fpsMatch = result.match(/'fps':\s*(\d+)/)
        const sizeMatch = result.match(/'size':\s*(\d+)/)

        return {
          result_type: resultType === 'infographic' ? 'image' : resultType,
          content: {
            path: path,
            mime_type: path.endsWith('.mp4') ? 'video/mp4' : 'image/png',
            ...(durationMatch && { duration: parseFloat(durationMatch[1]) }),
            ...(fpsMatch && { fps: parseInt(fpsMatch[1], 10) }),
            ...(sizeMatch && { size: parseInt(sizeMatch[1], 10) })
          }
        }
      }

      // 方法2: 尝试匹配 outputs 目录中的路径
      const outputPathMatch = result.match(/outputs\/([^'\s]+\.(?:mp4|png|jpg|jpeg|gif|svg))/)
      if (outputPathMatch) {
        const path = outputPathMatch[1]
        const isVideo = path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov')

        return {
          result_type: isVideo ? 'video' : 'image',
          content: {
            path: path,
            mime_type: isVideo ? 'video/mp4' : 'image/png'
          }
        }
      }
    }

    // 如果是对象但没有result_type
    if (typeof result === 'object' && result.content?.path) {
      return result
    }

    // 返回原始结果
    return result
  }

  // 获取媒体文件的Blob URL
  // 渲染 Stream 内容（实时日志）
  const renderStreamContent = () => {
    // streamData 是来自 Motia SDK 的对象数组，每个对象包含 id 和其他字段
    const entries = Array.isArray(streamData) ? streamData : []

    if (entries.length === 0) {
      return (
        <div className="stream-content">
          <div className="no-stream-data">
            <p>暂无实时日志数据</p>
            <p className="hint">任务执行时会显示实时进度和心跳信息</p>
          </div>
        </div>
      )
    }

    return (
      <div className="stream-content">
        <div className="stream-header">
          <h3>任务执行日志</h3>
          <div className="stream-info">
            <span className="stream-count">{entries.length} 条记录</span>
            <span className="stream-live">● WebSocket 实时连接</span>
          </div>
        </div>
        <div className="stream-entries">
          {entries.map((entry) => {
            // entry 是对象，包含 id, type, status, message, timestamp 等字段
            return (
              <div key={entry.id} className={`stream-entry stream-entry-${entry.status || 'info'}`}>
                <div className="entry-header">
                  <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className={`entry-status status-${entry.status || 'info'}`}>
                    {entry.status || 'pending'}
                  </span>
                  {entry.type && <span className="entry-step">{entry.type}</span>}
                </div>
                {entry.task && <div className="entry-task">{entry.task}</div>}
                {entry.message && <div className="entry-output">{entry.message}</div>}
                {entry.error && <div className="entry-error">{entry.error}</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const getMediaBlobUrl = async (path) => {
    if (mediaUrls[path]) {
      return mediaUrls[path]
    }

    try {
      // 使用查询参数格式：/media?path=xxx 而不是 /media/xxx
      const response = await fetch(`${API_BASE_URL}/media?path=${encodeURIComponent(path)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch file')
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      setMediaUrls(prev => ({ ...prev, [path]: blobUrl }))
      return blobUrl
    } catch (error) {
      console.error('Error fetching media file:', error)
      return null
    }
  }

  // 渲染可视化内容（视频、图片等）
  const renderVisualContent = (result) => {
    const parsedResult = extractParsedResult(result)
    const resultType = getResultType(result)

    if (resultType === 'video' && parsedResult.content?.path) {
      // 处理视频
      let videoPath = parsedResult.content.path
      // 移除前导的/outputs/如果存在
      videoPath = videoPath.replace(/^\/?outputs\//, '')

      return (
        <div className="result-visual">
          <VideoPlayer
            videoPath={videoPath}
            duration={parsedResult.content.duration}
            fps={parsedResult.content.fps}
            size={parsedResult.content.size}
            getBlobUrl={getMediaBlobUrl}
          />
        </div>
      )
    }

    if (resultType === 'image' && parsedResult.content?.path) {
      // 处理图片
      let imagePath = parsedResult.content.path
      // 移除前导的/outputs/如果存在
      imagePath = imagePath.replace(/^\/?outputs\//, '')

      return (
        <div className="result-visual">
          <ImagePlayer
            imagePath={imagePath}
            getBlobUrl={getMediaBlobUrl}
          />
        </div>
      )
    }

    if (resultType === 'table' && typeof result === 'object') {
      // 处理表格
      const { content } = result
      if (!content || !content.columns || !content.rows) {
        return <div className="no-result">无效的表格数据</div>
      }

      return (
        <div className="result-table">
          <div className="table-controls">
            <input
              type="text"
              placeholder="搜索表格..."
              className="table-search"
              onChange={(e) => {
                const query = e.target.value.toLowerCase()
                const rows = document.querySelectorAll('.data-table tbody tr')
                rows.forEach(row => {
                  const text = row.textContent.toLowerCase()
                  row.style.display = text.includes(query) ? '' : 'none'
                })
              }}
            />
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {content.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return <div className="no-visual">此结果类型不支持可视化预览</div>
  }

  // 渲染文本内容
  const renderTextContent = (result) => {
    let textContent = ''

    if (typeof result === 'string') {
      // 过滤掉调试信息和多余内容
      textContent = result
        .split('\n')
        .filter(line => {
          // 过滤掉DEBUG信息
          if (line.trim().startsWith('[DEBUG]')) return false
          // 过滤掉成功消息
          if (line.trim().startsWith('success=True')) return false
          if (line.trim().startsWith('✅')) return false
          if (line.trim().startsWith('📸')) return false
          // 过滤掉长输出语句
          if (line.includes('export=') && line.length > 200) return false
          return true
        })
        .join('\n')
        .trim()

      // 如果过滤后为空或太短，显示有用的信息
      if (textContent.length < 10) {
        // 尝试提取关键信息
        const urlMatch = result.match(/(https?:\/\/[^\s]+)/)
        if (urlMatch) {
          textContent = `结果URL: ${urlMatch[1]}`
        } else if (result.includes('output=')) {
          // 如果有output=，提取这个值
          const outputMatch = result.match(/output\s*=\s*({[^}]+})/s)
          if (outputMatch) {
            textContent = `任务执行成功\n\n${outputMatch[1]}`
          }
        } else {
          textContent = result || '暂无文本内容'
        }
      }
    } else if (typeof result === 'object') {
      if (result.text) {
        textContent = result.text
      } else if (result.content?.text) {
        textContent = result.content.text
      } else {
        textContent = JSON.stringify(result, null, 2)
      }
    }

    return (
      <div className="result-text-content">
        <pre className="result-text">{textContent || '暂无文本内容'}</pre>
      </div>
    )
  }

  const renderResult = (result) => {
    if (!result) {
      return <div className="no-result">暂无结果</div>
    }

    const resultType = getResultType(result)
    const hasVisual = ['video', 'image', 'table'].includes(resultType)
    const hasStream = streamData && Array.isArray(streamData) && streamData.length > 0

    return (
      <div className="result-container">
        {/* Tab切换 */}
        <div className="result-tabs">
          {hasVisual && (
            <>
              <button
                className={`tab-button ${activeTab === 'visual' ? 'active' : ''}`}
                onClick={() => setActiveTab('visual')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                  <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                </svg>
                多媒体
              </button>
              <button
                className={`tab-button ${activeTab === 'text' ? 'active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                  <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                JSON
              </button>
            </>
          )}
          {hasStream && (
            <button
              className={`tab-button ${activeTab === 'stream' ? 'active' : ''}`}
              onClick={() => setActiveTab('stream')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
                <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
              </svg>
              实时日志
              <span className="stream-indicator">●</span>
            </button>
          )}
        </div>

        {/* 内容区域 */}
        <div className="result-content">
          {activeTab === 'stream' ? (
            renderStreamContent()
          ) : hasVisual ? (
            <>
              {activeTab === 'visual' && renderVisualContent(result)}
              {activeTab === 'text' && renderTextContent(result)}
            </>
          ) : (
            renderTextContent(result)
          )}
        </div>
      </div>
    )
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
                <span className={`info-value status status-${task.executionTime === null ? 'running' : (task.success ? 'completed' : 'failed')}`}>
                  {task.executionTime === null ? '执行中' : (task.success ? '成功' : '失败')}
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

        {/* 任务结果 */}
        {task.output && (
          <div className="info-section">
            <h2>任务结果</h2>
            <div className="task-result">
              {renderResult(task.output)}
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {task.error && (
          <div className="info-section">
            <h2>错误信息</h2>
            <div className="task-error">
              <pre>{task.error}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Video Player Component
function VideoPlayer({ videoPath, duration, fps, size, getBlobUrl }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    const loadVideo = async () => {
      setLoading(true)
      setError(false)
      setDebugInfo(`开始加载视频: ${videoPath}`)

      try {
        const url = await getBlobUrl(videoPath)

        if (url) {
          setVideoUrl(url)
          setDebugInfo(`视频加载成功: ${url.substring(0, 50)}...`)
        } else {
          setError(true)
          setDebugInfo('getBlobUrl返回null')
        }
      } catch (err) {
        console.error('加载视频失败:', err)
        setError(true)
        setDebugInfo(`加载失败: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    loadVideo()
  }, [videoPath, getBlobUrl])

  if (loading) {
    return (
      <div className="media-loading">
        <div className="loading-spinner"></div>
        <p>加载视频中...</p>
        {debugInfo && <small style={{color: '#999'}}>{debugInfo}</small>}
      </div>
    )
  }

  if (error || !videoUrl) {
    return (
      <div className="media-error">
        <p>视频加载失败</p>
        <small>路径: {videoPath}</small>
        {debugInfo && <p><small>{debugInfo}</small></p>}
      </div>
    )
  }

  return (
    <>
      <video
        controls
        className="video-player"
        preload="metadata"
        controlsList="nodownload"
        onLoadedMetadata={(e) => {
          console.log('视频元数据加载完成:', e.target.duration)
        }}
        onError={(e) => {
          console.error('视频加载错误:', e)
          setError(true)
          setDebugInfo(`视频元素错误: ${e.target.error?.message || '未知错误'}`)
        }}
      >
        <source src={videoUrl} type="video/mp4" />
        您的浏览器不支持视频标签。
      </video>
      {duration && (
        <div className="media-metadata">
          <p>时长: {duration}秒</p>
          {fps && <p>帧率: {fps} FPS</p>}
          {size && <p>大小: {(size / 1024 / 1024).toFixed(2)} MB</p>}
        </div>
      )}
    </>
  )
}

// Image Player Component
function ImagePlayer({ imagePath, getBlobUrl }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      setLoading(true)
      setError(false)
      const url = await getBlobUrl(imagePath)
      if (url) {
        setImageUrl(url)
      } else {
        setError(true)
      }
      setLoading(false)
    }

    loadImage()
  }, [imagePath, getBlobUrl])

  if (loading) {
    return <div className="media-loading">加载图片...</div>
  }

  if (error || !imageUrl) {
    return <div className="media-error">图片加载失败</div>
  }

  return (
    <img
      src={imageUrl}
      alt="任务结果"
      className="image-result"
      onClick={() => window.open(imageUrl, '_blank')}
    />
  )
}

export default TaskDetail