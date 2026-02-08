import { useState, useRef, useEffect } from 'react'
import './AudioPlayer.css'

/**
 * AudioPlayer - 音频播放器组件
 *
 * 用于播放音频文件，支持播放/暂停、进度条、音量控制等
 */
const AudioPlayer = ({ audioPath, audioUrl, getBlobUrl, filename = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [url, setUrl] = useState(null)

  const audioRef = useRef(null)
  const progressBarRef = useRef(null)
  const volumeSliderRef = useRef(null)

  // 初始化音量滚动条的背景
  useEffect(() => {
    if (volumeSliderRef.current) {
      const percentage = volume * 100
      volumeSliderRef.current.style.background = `linear-gradient(to right, #4a9eff ${percentage}%, rgba(255, 255, 255, 0.15) ${percentage}%)`
    }
  }, [volume])
  const previousUrlRef = useRef(null)

  // 异步构建 audio URL
  useEffect(() => {
    let isMounted = true

    const buildUrl = async () => {
      // 清理旧的 blob URL
      if (previousUrlRef.current && previousUrlRef.current.startsWith('blob:')) {
        console.log('[AudioPlayer] Revoking old blob URL:', previousUrlRef.current)
        URL.revokeObjectURL(previousUrlRef.current)
        previousUrlRef.current = null
      }

      if (audioUrl) {
        if (isMounted) {
          setUrl(audioUrl)
          previousUrlRef.current = audioUrl
        }
        return
      }
      if (audioPath) {
        // 如果是本地路径，尝试使用 getBlobUrl
        if (getBlobUrl && typeof getBlobUrl === 'function') {
          console.log('[AudioPlayer] Fetching blob URL for:', audioPath)
          const blobUrl = await getBlobUrl(audioPath)
          if (isMounted) {
            console.log('[AudioPlayer] Got blob URL:', blobUrl)
            setUrl(blobUrl)
            previousUrlRef.current = blobUrl
          }
        } else {
          // 否则直接返回路径
          console.log('[AudioPlayer] Using direct path:', audioPath)
          if (isMounted) {
            setUrl(audioPath)
            previousUrlRef.current = audioPath
          }
        }
        return
      }
      if (isMounted) {
        setUrl(null)
        previousUrlRef.current = null
      }
    }

    buildUrl()

    return () => {
      isMounted = false
    }
  }, [audioPath, audioUrl]) // 移除 getBlobUrl 依赖，避免不必要的重新获取

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !url) return

    const setAudioData = () => {
      setDuration(audio.duration)
      setCurrentTime(audio.currentTime)
      setIsLoading(false)
    }

    const setAudioTime = () => setCurrentTime(audio.currentTime)

    const handlePlay = () => {
      console.log('[AudioPlayer] Playback started')
      setIsPlaying(true)
      setIsLoading(false)
    }

    const handlePause = () => {
      console.log('[AudioPlayer] Playback paused')
      setIsPlaying(false)
      setIsLoading(false)
    }

    const handleEnded = () => {
      console.log('[AudioPlayer] Playback ended')
      setIsPlaying(false)
      setCurrentTime(0)
      setIsLoading(false)
    }

    audio.addEventListener('loadeddata', setAudioData)
    audio.addEventListener('timeupdate', setAudioTime)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    // 错误处理
    const handleError = (e) => {
      console.error('Audio error:', e)
      console.error('Audio src:', audio.src)
      console.error('Audio error code:', audio.error?.code)
      console.error('Audio error message:', audio.error?.message)
      setError('音频加载失败')
      setIsLoading(false)
      setIsPlaying(false)
    }
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadeddata', setAudioData)
      audio.removeEventListener('timeupdate', setAudioTime)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [url])

  // 组件卸载时清理最终的 blob URL
  useEffect(() => {
    return () => {
      if (previousUrlRef.current && previousUrlRef.current.startsWith('blob:')) {
        console.log('[AudioPlayer] Revoking final blob URL on unmount')
        URL.revokeObjectURL(previousUrlRef.current)
      }
    }
  }, [])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || !url) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      setIsLoading(true)
      try {
        await audio.play()
        setIsPlaying(true)
        setIsLoading(false)
      } catch (error) {
        console.error('Play error:', error)
        setIsPlaying(false)
        setIsLoading(false)
        setError('播放失败')
      }
    }
  }

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio) return

    const progressBar = progressBarRef.current
    const rect = progressBar.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    audio.currentTime = pos * duration
  }

  const handleVolumeChange = (e) => {
    const audio = audioRef.current
    if (!audio) return

    const newVolume = parseFloat(e.target.value)
    audio.volume = newVolume
    setVolume(newVolume)

    // 更新滚动条背景填充效果
    const slider = e.target
    const percentage = (newVolume - e.target.min) / (e.target.max - e.target.min) * 100
    slider.style.background = `linear-gradient(to right, #4a9eff ${percentage}%, rgba(255, 255, 255, 0.15) ${percentage}%)`
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!url) {
    return (
      <div className="audio-player-wrapper">
        <div className="audio-player-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="audio-placeholder-icon">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          <div className="audio-placeholder-text">音频加载中...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="audio-player-wrapper">
        <div className="audio-player-error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="audio-error-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4m0 4h.01"/>
          </svg>
          <div>音频加载失败</div>
        </div>
      </div>
    )
  }

  return (
    <div className="audio-player-wrapper">
      <div className="audio-player-header">
        <div className="audio-player-info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="audio-icon">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          {filename && <span className="audio-filename">{filename}</span>}
        </div>
        <div className="audio-badge">{isPlaying ? '播放中' : '已就绪'}</div>
      </div>

      <div className="audio-player-body">
        <audio ref={audioRef} src={url} />

        {/* 波形可视化（静态展示） */}
        <div className="audio-waveform">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className={`audio-wave-bar ${isPlaying ? 'playing' : ''}`}
              style={{
                animationDelay: `${i * 0.05}s`,
                height: `${Math.random() * 60 + 20}%`
              }}
            />
          ))}
        </div>

        <div className="audio-player-controls">
          {/* 播放/暂停按钮 */}
          <button
            className={`audio-play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlay}
            disabled={isLoading}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isLoading ? (
              <div className="audio-spinner" />
            ) : isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* 进度条 */}
          <div className="audio-progress-wrapper">
            <div className="audio-time-label">{formatTime(currentTime)}</div>
            <div
              ref={progressBarRef}
              className="audio-progress-bar"
              onClick={handleSeek}
              title="点击跳转"
            >
              <div
                className="audio-progress-fill"
                style={{ width: `${progress}%` }}
              >
                <div className="audio-progress-handle" />
              </div>
            </div>
            <div className="audio-time-label">{formatTime(duration)}</div>
          </div>

          {/* 音量控制 */}
          <div className="audio-volume-control">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="audio-volume-icon">
              <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <input
              ref={volumeSliderRef}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="audio-volume-slider"
              title="音量"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AudioPlayer
