import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksAPI } from '../services/api'
import './TaskDetail.css'

function TaskDetail() {
  const { id } = useParams()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('visual') // 'visual' or 'text'
  const [mediaUrls, setMediaUrls] = useState({}) // Cache for blob URLs
  const pollIntervalRef = useRef(null) // 使用 ref 来管理 interval

  useEffect(() => {
    // 清理之前的 interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    const fetchTaskDetails = async () => {
      try {
        const response = await tasksAPI.getTaskDetails(id)
        setTask(response.data)
        setError('')
        setLoading(false)
        return { found: true, error: null }
      } catch (error) {
        console.error('Error fetching task details:', error)
        setLoading(false)
        // 如果是404错误，说明任务还在执行中，继续轮询
        if (error.response?.status === 404) {
          return { found: false, error: null }
        }
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

        // 如果找到任务、出错或达到最大轮询次数，停止轮询
        if (result.found || result.error || pollCount >= maxPolls) {
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          if (result.error) {
            setError('获取任务详情失败')
          } else if (!result.found && pollCount >= maxPolls) {
            setError('任务执行超时，请稍后刷新页面重试')
          }
        }
      }

      // 立即执行一次
      await poll()

      // 如果还没找到且没有错误，开始轮询
      if (pollCount < maxPolls && !error && !task) {
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
  const getMediaBlobUrl = async (path) => {
    if (mediaUrls[path]) {
      return mediaUrls[path]
    }

    try {
      // 直接使用outputs服务器
      const response = await fetch(`http://localhost:3001/outputs/${path}`)
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

    return (
      <div className="result-container">
        {/* Tab切换 */}
        {hasVisual && (
          <div className="result-tabs">
            <button
              className={`tab-button ${activeTab === 'visual' ? 'active' : ''}`}
              onClick={() => setActiveTab('visual')}
            >
              📊 可视化
            </button>
            <button
              className={`tab-button ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              📝 文本
            </button>
          </div>
        )}

        {/* 内容区域 */}
        <div className="result-content">
          {hasVisual ? (
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
    // 确认删除
    if (!window.confirm(`确定要删除任务 ${task.taskId} 吗?此操作不可恢复。`)) {
      return
    }

    try {
      await tasksAPI.deleteTask(task.taskId)
      // 删除成功后跳转回任务列表
      window.location.href = '/tasks'
    } catch (error) {
      console.error('删除任务失败:', error)
      alert('删除任务失败,请稍后重试')
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
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            删除任务
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
              <span className={`info-value status status-${task.success ? 'completed' : 'failed'}`}>
                {task.success ? '成功' : '失败'}
              </span>
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
        const fullPath = `http://localhost:3001/outputs/${videoPath}`
        setDebugInfo(`请求URL: ${fullPath}`)

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