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

  const audioRef = useRef(null)
  const progressBarRef = useRef(null)

  // 构建 audio URL
  const buildAudioUrl = () => {
    if (audioUrl) {
      return audioUrl
    }
    if (audioPath) {
      // 如果是本地路径，尝试使用 getBlobUrl
      if (getBlobUrl && typeof getBlobUrl === 'function') {
        return getBlobUrl(audioPath)
      }
      // 否则直接返回路径
      return audioPath
    }
    return null
  }

  const url = buildAudioUrl()

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !url) return

    const setAudioData = () => {
      setDuration(audio.duration)
      setCurrentTime(audio.currentTime)
      setIsLoading(false)
    }

    const setAudioTime = () => setCurrentTime(audio.currentTime)

    audio.addEventListener('loadeddata', setAudioData)
    audio.addEventListener('timeupdate', setAudioTime)

    // 错误处理
    const handleError = (e) => {
      console.error('Audio error:', e)
      setError('音频加载失败')
      setIsLoading(false)
    }
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadeddata', setAudioData)
      audio.removeEventListener('timeupdate', setAudioTime)
      audio.removeEventListener('error', handleError)
    }
  }, [url])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio || !url) return

    if (isPlaying) {
      audio.pause()
    } else {
      setIsLoading(true)
      audio.play()
    }
    setIsPlaying(!isPlaying)
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
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!url) {
    return <div className="audio-player-error">无音频文件</div>
  }

  if (error) {
    return <div className="audio-player-error">{error}</div>
  }

  return (
    <div className="audio-player-container">
      {filename && <div className="audio-player-filename">🎵 {filename}</div>}
      <audio ref={audioRef} src={url} />

      <div className="audio-player-controls">
        <button
          className="audio-player-play-btn"
          onClick={togglePlay}
          disabled={isLoading}
        >
          {isLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'}
        </button>

        <div className="audio-player-progress-container">
          <span className="audio-player-time">{formatTime(currentTime)}</span>
          <div
            ref={progressBarRef}
            className="audio-player-progress-bar"
            onClick={handleSeek}
          >
            <div
              className="audio-player-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="audio-player-time">{formatTime(duration)}</span>
        </div>

        <div className="audio-player-volume">
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="audio-player-volume-slider"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioPlayer
