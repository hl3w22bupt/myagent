import { useState, useEffect } from 'react'
import './VideoPlayer.css'


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

export default VideoPlayer
