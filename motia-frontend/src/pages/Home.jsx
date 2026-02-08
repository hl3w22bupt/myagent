import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { systemAPI, tasksAPI, skillsAPI, agentsAPI, favoritesAPI } from '../services/api'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [systemInfo, setSystemInfo] = useState(null)
  const [recentTasks, setRecentTasks] = useState([])
  const [skills, setSkills] = useState([])
  const [agents, setAgents] = useState([])
  const [favorites, setFavorites] = useState([])
  const [favoritesPage, setFavoritesPage] = useState(1)
  const [favoritesTotal, setFavoritesTotal] = useState(0)
  const [favoritesType, setFavoritesType] = useState('')
  const [favoritesStats, setFavoritesStats] = useState({
    video: 0,
    image: 0,
    code: 0,
    total: 0
  })
  const [loading, setLoading] = useState(true)
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [taskContent, setTaskContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 获取媒体文件的 Blob URL - 完全复制任务详情页的实现
  const getMediaBlobUrl = async (path) => {
    if (!path) return null

    try {
      // 使用查询参数格式：/media?path=xxx
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
      const response = await fetch(`${API_BASE_URL}/media?path=${encodeURIComponent(path)}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      return URL.createObjectURL(blob)
    } catch (error) {
      console.error('Error loading media:', error)
      return null
    }
  }

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

  // 获取精选产物和各类型统计
  useEffect(() => {
    const fetchFavorites = async () => {
      setLoadingFavorites(true)
      try {
        const result = await favoritesAPI.getFavorites({
          page: favoritesPage,
          limit: 6,
          type: favoritesType || undefined
        })

        // 过滤掉重复的 artifact_id（前端额外保护）
        const uniqueFavorites = (result.favorites || []).filter((fav, index, self) =>
          index === self.findIndex(f => f.artifactId === fav.artifactId)
        )

        setFavorites(uniqueFavorites)
        setFavoritesTotal(result.total || 0)

        // 统计各类型数量
        if (favoritesType === '') {
          const allResult = await favoritesAPI.getFavorites({ page: 1, limit: 1000 })
          const stats = { video: 0, image: 0, code: 0, total: 0 }
          allResult.favorites.forEach(f => {
            if (f.artifactType === 'video') stats.video++
            else if (f.artifactType === 'image') stats.image++
            else if (f.artifactType === 'code') stats.code++
            stats.total++
          })
          setFavoritesStats(stats)
        }
      } catch (error) {
        console.error('Error fetching favorites:', error)
      } finally {
        setLoadingFavorites(false)
      }
    }

    fetchFavorites()
  }, [favoritesPage, favoritesType])

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const handleFavoritesPageChange = (newPage) => {
    setFavoritesPage(newPage)
  }

  const handleFavoritesTypeChange = (type) => {
    setFavoritesType(type)
    setFavoritesPage(1) // 重置到第一页
  }

  const [modalMedia, setModalMedia] = useState(null) // 模态框媒体内容
  const [showModal, setShowModal] = useState(false) // 显示模态框

  const openModal = (favorite) => {
    setModalMedia(favorite)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setModalMedia(null)
  }

  const renderFavoriteCard = (favorite) => {
    const { artifactType, path, description, taskId, artifactId } = favorite

    // 根据类型渲染不同的预览
    const renderPreview = () => {
      switch (artifactType) {
        case 'video':
          return (
            <FavoriteVideoPreview path={path} getMediaBlobUrl={getMediaBlobUrl} />
          )
        case 'image':
          return (
            <FavoriteImagePreview path={path} getMediaBlobUrl={getMediaBlobUrl} />
          )
        case 'code':
          return (
            <div className="favorite-preview favorite-preview-code">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M16.5 10.5l-4.72 4.72a.75.75 0 01-1.28-.53l-4.72-4.72M7.5 13.5l4.72-4.72a.75.75 0 011.28.53l4.72 4.72" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )
        default:
          return (
            <div className="favorite-preview favorite-preview-default">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.625a3.375 3.375 0 00-3.375 3.375v1.5A1.125 1.125 0 014.5 11.25v1.5a3.375 3.375 0 003.375 3.375h1.5A1.125 1.125 0 0110.5 16.875v1.5a3.375 3.375 0 003.375 3.375h1.5a3.375 3.375 0 003.375-3.375v-1.5a1.125 1.125 0 011.125-1.125h1.5a3.375 3.375 0 003.375-3.375z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )
      }
    }

    return (
      <div className="favorite-card">
        <div className="favorite-card-preview" onClick={() => openModal(favorite)}>
          {renderPreview()}
        </div>
        <Link to={`/tasks/${taskId}`} className="favorite-card-content">
          <p className="favorite-card-description">
            {description || '暂无描述'}
          </p>
          <div className="favorite-card-meta">
            <span className={`favorite-card-type type-${artifactType}`}>
              {artifactType === 'video' ? '视频' : artifactType === 'image' ? '图片' : artifactType === 'code' ? '代码' : '文件'}
            </span>
          </div>
        </Link>
      </div>
    )
  }

  // 视频预览组件 - 使用原生 video 标签
  const FavoriteVideoPreview = ({ path, getMediaBlobUrl }) => {
    const [videoUrl, setVideoUrl] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
      const loadVideo = async () => {
        if (!path) {
          console.error('[FavoriteVideoPreview] No path provided')
          setError(true)
          setLoading(false)
          return
        }

        console.log('[FavoriteVideoPreview] Loading video:', path)
        setLoading(true)
        setError(false)

        try {
          const url = await getMediaBlobUrl(path)
          console.log('[FavoriteVideoPreview] Video URL:', url)
          if (url) {
            setVideoUrl(url)
          } else {
            console.error('[FavoriteVideoPreview] getMediaBlobUrl returned null')
            setError(true)
          }
        } catch (err) {
          console.error('[FavoriteVideoPreview] Load error:', err)
          setError(true)
        } finally {
          setLoading(false)
        }
      }

      loadVideo()
    }, [path, getMediaBlobUrl])

    if (loading) {
      return (
        <div className="favorite-preview favorite-preview-video">
          <div className="media-loading">加载中...</div>
        </div>
      )
    }

    if (error || !videoUrl) {
      console.error('[FavoriteVideoPreview] Rendering error state, videoUrl:', videoUrl)
      return (
        <div className="favorite-preview favorite-preview-video">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9M4.5 14.25h9M4.5 9.75h9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )
    }

    return (
      <div className="favorite-preview favorite-preview-video">
        <video
          src={videoUrl}
          controls
          className="favorite-video-player"
          preload="metadata"
          controlsList="nodownload"
          onError={(e) => {
            console.error('[FavoriteVideoPreview] Video element error:', e.target.error)
            setError(true)
          }}
          onLoadedMetadata={(e) => {
            console.log('[FavoriteVideoPreview] Video metadata loaded, duration:', e.target.duration)
          }}
        />
      </div>
    )
  }

  // 图片预览组件
  const FavoriteImagePreview = ({ path, getMediaBlobUrl }) => {
    const [imageUrl, setImageUrl] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const loadImage = async () => {
        if (!path) return
        setLoading(true)
        const url = await getMediaBlobUrl(path)
        setImageUrl(url)
        setLoading(false)
      }

      loadImage()
    }, [path, getMediaBlobUrl])

    if (loading || !imageUrl) {
      return (
        <div className="favorite-preview favorite-preview-image">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="8.5" cy="8.5" r="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )
    }

    return (
      <div className="favorite-preview favorite-preview-image">
        <img
          src={imageUrl}
          alt="精选图片"
          className="favorite-image-preview"
        />
      </div>
    )
  }

  // 模态框视频预览组件
  const ModalVideoPreview = ({ path, getMediaBlobUrl }) => {
    const [videoUrl, setVideoUrl] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const loadVideo = async () => {
        if (!path) return
        setLoading(true)
        const url = await getMediaBlobUrl(path)
        setVideoUrl(url)
        setLoading(false)
      }

      loadVideo()
    }, [path, getMediaBlobUrl])

    useEffect(() => {
      // 清理 blob URL 以防止内存泄漏
      return () => {
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl)
        }
      }
    }, [videoUrl])

    if (loading || !videoUrl) {
      return (
        <div className="media-modal-loading">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9M4.5 14.25h9M4.5 9.75h9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>加载中...</p>
        </div>
      )
    }

    return (
      <video
        src={videoUrl}
        controls
        autoPlay
        className="media-modal-video"
      />
    )
  }

  // 模态框图片预览组件
  const ModalImagePreview = ({ path, getMediaBlobUrl }) => {
    const [imageUrl, setImageUrl] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const loadImage = async () => {
        if (!path) return
        setLoading(true)
        const url = await getMediaBlobUrl(path)
        setImageUrl(url)
        setLoading(false)
      }

      loadImage()
    }, [path, getMediaBlobUrl])

    useEffect(() => {
      // 清理 blob URL 以防止内存泄漏
      return () => {
        if (imageUrl) {
          URL.revokeObjectURL(imageUrl)
        }
      }
    }, [imageUrl])

    if (loading || !imageUrl) {
      return (
        <div className="media-modal-loading">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="8.5" cy="8.5" r="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>加载中...</p>
        </div>
      )
    }

    return (
      <img
        src={imageUrl}
        alt="预览图片"
        className="media-modal-image"
      />
    )
  }

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showModal) {
        if (e.key === 'Escape') {
          closeModal()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showModal])

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

          {/* 精选产物区域 */}
          <div className="favorites-wrapper">
            <div className="container">
              <div className="favorites-section">
                {/* Header with Title and Filter Tabs */}
                <div className="favorites-header">
                  <h2>精选产物</h2>
                  <div className="favorites-filter">
                    <div className="filter-tabs">
                      <button
                        className={`filter-tab ${favoritesType === '' ? 'active' : ''}`}
                        onClick={() => handleFavoritesTypeChange('')}
                      >
                        全部
                        <span className="filter-count">{favoritesStats.total}</span>
                      </button>
                      <button
                        className={`filter-tab ${favoritesType === 'video' ? 'active' : ''}`}
                        onClick={() => handleFavoritesTypeChange('video')}
                      >
                        视频
                        <span className="filter-count">{favoritesStats.video}</span>
                      </button>
                      <button
                        className={`filter-tab ${favoritesType === 'image' ? 'active' : ''}`}
                        onClick={() => handleFavoritesTypeChange('image')}
                      >
                        图片
                        <span className="filter-count">{favoritesStats.image}</span>
                      </button>
                      <button
                        className={`filter-tab ${favoritesType === 'code' ? 'active' : ''}`}
                        onClick={() => handleFavoritesTypeChange('code')}
                      >
                        代码
                        <span className="filter-count">{favoritesStats.code}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {loadingFavorites ? (
                  <div className="loading">加载中...</div>
                ) : favorites.length > 0 ? (
                  <>
                    <div className="favorites-grid">
                      {favorites.map(favorite => renderFavoriteCard(favorite))}
                    </div>

                    {/* 分页控制 */}
                    {favoritesTotal > 6 && (
                      <div className="favorites-pagination">
                        <button
                          className="pagination-button"
                          onClick={() => handleFavoritesPageChange(favoritesPage - 1)}
                          disabled={favoritesPage === 1}
                        >
                          上一页
                        </button>
                        <span className="pagination-info">
                          第 {favoritesPage} 页 / 共 {Math.ceil(favoritesTotal / 6)} 页
                        </span>
                        <button
                          className="pagination-button"
                          onClick={() => handleFavoritesPageChange(favoritesPage + 1)}
                          disabled={favoritesPage >= Math.ceil(favoritesTotal / 6)}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="no-favorites">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.11z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>暂无精选产物</p>
                    <p className="no-favorites-hint">在任务详情页点击收藏按钮添加精选</p>
                  </div>
                )}
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

      {/* 媒体预览模态框 */}
      {showModal && modalMedia && (
        <div className="media-modal" onClick={closeModal}>
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="media-modal-close" onClick={closeModal}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="media-modal-body">
              {modalMedia.artifactType === 'video' && (
                <ModalVideoPreview path={modalMedia.path} getMediaBlobUrl={getMediaBlobUrl} />
              )}
              {modalMedia.artifactType === 'image' && (
                <ModalImagePreview path={modalMedia.path} getMediaBlobUrl={getMediaBlobUrl} />
              )}
              {modalMedia.artifactType === 'code' && (
                <div className="media-modal-code">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M16.5 10.5l-4.72 4.72a.75.75 0 01-1.28-.53l-4.72-4.72M7.5 13.5l4.72-4.72a.75.75 0 011.28.53l4.72 4.72" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>代码预览功能即将上线</p>
                </div>
              )}
            </div>
            <div className="media-modal-footer">
              <Link to={`/tasks/${modalMedia.taskId}`} className="media-modal-task-link" onClick={closeModal}>
                查看任务详情
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home