import { useState, useEffect, useRef } from 'react'
import './VideoPlayer.css'

// 模块级别的 blob URL 缓存（与 AudioPlayer 共享相同的逻辑）
const blobUrlCache = new Map()

/**
 * 获取或创建 blob URL（带缓存）
 */
async function getOrCreateBlobUrl(path, getBlobUrlFn) {
  if (blobUrlCache.has(path)) {
    console.log('[VideoPlayer] Using cached blob URL for:', path)
    return blobUrlCache.get(path)
  }

  console.log('[VideoPlayer] Fetching new blob URL for:', path)
  const blobUrl = await getBlobUrlFn(path)
  blobUrlCache.set(path, blobUrl)
  return blobUrl
}

/**
 * 清理指定路径的 blob URL 缓存
 */
function revokeBlobUrl(path) {
  if (blobUrlCache.has(path)) {
    const url = blobUrlCache.get(path)
    console.log('[VideoPlayer] Revoking blob URL for:', path)
    URL.revokeObjectURL(url)
    blobUrlCache.delete(path)
  }
}

/**
 * VideoPlayer - 视频播放器组件
 *
 * 用于播放视频文件，支持加载状态、错误处理和元数据显示
 */
function VideoPlayer({ videoPath, duration, fps, size, getBlobUrl }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const currentPathRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    const previousPath = currentPathRef.current

    const loadVideo = async () => {
      setLoading(true)
      setError(false)
      setDebugInfo(`开始加载视频: ${videoPath}`)

      try {
        const url = await getOrCreateBlobUrl(videoPath, getBlobUrl)

        if (url && isMounted) {
          setVideoUrl(url)
          setDebugInfo(`视频加载成功: ${url.substring(0, 50)}...`)
        } else if (isMounted) {
          setError(true)
          setDebugInfo('getBlobUrl返回null')
        }
      } catch (err) {
        console.error('[VideoPlayer] 加载视频失败:', err)
        if (isMounted) {
          setError(true)
          setDebugInfo(`加载失败: ${err.message}`)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadVideo()
    currentPathRef.current = videoPath

    return () => {
      isMounted = false
      // 清理之前路径的 blob URL（仅当路径改变时）
      if (previousPath && previousPath !== videoPath && !previousPath.startsWith('blob:')) {
        revokeBlobUrl(previousPath)
      }
    }
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
    <div className="video-wrapper">
      <div className="video-wrapper-inner">
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
      </div>
      {duration && (
        <div className="media-metadata">
          <p>时长: {duration}秒</p>
          {fps && <p>帧率: {fps} FPS</p>}
          {size && <p>大小: {(size / 1024 / 1024).toFixed(2)} MB</p>}
        </div>
      )}
    </div>
  )
}

export default VideoPlayer
