import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  XMarkIcon,
  DocumentIcon,
  FolderIcon,
  FolderOpenIcon,
  CodeBracketIcon,
  PhotoIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import CodePlayer from './CodePlayer'
import './WorkspaceTab.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_URL || 'http://localhost:3010'
const POLL_INTERVAL = 5000 // 5s polling during execution

const WorkspaceTab = ({ taskId, taskStatus }) => {
  const [workspace, setWorkspace] = useState(null)
  const [files, setFiles] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cleanedUp, setCleanedUp] = useState(false) // 临时工作区已被清理
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pollTimerRef = useRef(null)

  const fetchWorkspaceFiles = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const response = await fetch(`/api/workspace/${taskId}`)

      if (!response.ok) {
        // Non-JSON or empty response (e.g. service down)
        let errorMsg = `请求失败 (${response.status})`
        try {
          const errData = await response.json()
          errorMsg = errData.error || errorMsg
        } catch {
          // Response body is not valid JSON (empty or HTML)
          if (response.status === 0) {
            errorMsg = '无法连接到服务器，请检查服务是否启动'
          }
        }
        setError(errorMsg)
        return
      }

      const data = await response.json()

      if (data.success) {
        // 临时工作区已被清理（/tmp 下的目录，重启后消失）
        if (data.data.exists === false) {
          setWorkspace(data.data.workspace)
          setFiles([])
          setSummary(null)
          setCleanedUp(true)
          return
        }
        setCleanedUp(false)
        setWorkspace(data.data.workspace)
        setFiles(data.data.files || [])
        setSummary(data.data.summary)

        const firstLevelFolders = new Set()
        ;(data.data.files || []).forEach(file => {
          if (file && file.relativePath) {
            const parts = file.relativePath.split('/')
            if (parts.length > 1) {
              firstLevelFolders.add(parts[0])
            }
          }
        })
        setExpandedFolders(firstLevelFolders)
      } else {
        // 检查是否是"没有 workspace"的情况
        const errorMsg = data.error || data.message || ''
        if (errorMsg.includes('does not have a workspace') ||
            errorMsg.includes('没有 workspace') ||
            response.status === 404) {
          // 这不是错误，而是正常的空状态
          setWorkspace(null)
          setFiles([])
          setSummary(null)
        } else {
          setError(data.error || '获取 workspace 信息失败')
        }
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        setError('无法连接到服务器，请检查服务是否启动')
      } else {
        setError(err.message || '网络请求失败')
      }
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [taskId])

  // Initial fetch + polling during execution
  useEffect(() => {
    fetchWorkspaceFiles()

    // Only poll when task is not in a terminal state
    const isRunning = !taskStatus || taskStatus === 'pending' || taskStatus === 'running'
    if (isRunning) {
      pollTimerRef.current = setInterval(() => {
        fetchWorkspaceFiles(false) // silent refresh (no loading spinner)
      }, POLL_INTERVAL)
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [taskId, taskStatus, fetchWorkspaceFiles])

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase()

    const iconMap = {
      // 代码文件
      'js': CodeBracketIcon,
      'jsx': CodeBracketIcon,
      'ts': CodeBracketIcon,
      'tsx': CodeBracketIcon,
      'py': CodeBracketIcon,
      'html': CodeBracketIcon,
      'css': CodeBracketIcon,
      'json': DocumentTextIcon,
      // 文本文件
      'txt': DocumentTextIcon,
      'md': DocumentTextIcon,
      // 图片文件
      'jpg': PhotoIcon,
      'jpeg': PhotoIcon,
      'png': PhotoIcon,
      'svg': PhotoIcon,
      'gif': PhotoIcon,
      'webp': PhotoIcon,
      // 视频文件
      'mp4': VideoCameraIcon,
      'webm': VideoCameraIcon,
      'mov': VideoCameraIcon,
      // 音频文件
      'mp3': MusicalNoteIcon,
      'wav': MusicalNoteIcon,
      'ogg': MusicalNoteIcon,
      // PDF
      'pdf': DocumentIcon,
    }

    const IconComponent = iconMap[ext] || DocumentIcon
    return <IconComponent className="file-icon-svg" />
  }

  const getLanguage = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase()

    const langMap = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'txt': 'text',
    }

    return langMap[ext] || 'text'
  }

  const getLanguageBadgeColor = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const colorMap = {
      'js': '#F7DF1E', 'jsx': '#F7DF1E',
      'ts': '#3178C6', 'tsx': '#3178C6',
      'py': '#3776AB',
      'html': '#E34F26',
      'css': '#1572B6',
      'json': '#292929',
      'md': '#083FA1',
      'yaml': '#CB171E', 'yml': '#CB171E',
    }
    return colorMap[ext] || null
  }

  const countFilesInFolder = (fileList, folderPath) => {
    return fileList.filter(f => f && f.relativePath && f.relativePath.startsWith(folderPath + '/')).length
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('zh-CN')
  }

  const toggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
      } else {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

  const handleFileClick = async (file) => {
    if (file.type === 'directory') return

    setSelectedFile(file)
    setContentLoading(true)
    setContentError(null)
    setFileContent(null)

    try {
      const url = `${MEDIA_BASE_URL}/media?path=${encodeURIComponent(file.path)}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`)
      }

      // 判断文件类型
      const ext = file.name.split('.').pop()?.toLowerCase()
      const mediaExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'ogg']
      const textExts = ['txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'xml', 'yaml', 'yml', 'log']

      if (mediaExts.includes(ext)) {
        // 媒体文件：返回 blob URL
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        setFileContent({ type: 'media', url: blobUrl, mimeType: blob.type })
      } else if (textExts.includes(ext) || response.headers.get('content-type')?.includes('text')) {
        // 文本文件：返回文本内容
        const text = await response.text()
        setFileContent({ type: 'text', content: text, filename: file.name })
      } else {
        // 其他文件：显示提示
        setFileContent({ type: 'binary', filename: file.name })
      }
    } catch (err) {
      console.error('Failed to load file:', err)
      setContentError(err.message)
    } finally {
      setContentLoading(false)
    }
  }

  const closePreview = () => {
    setSelectedFile(null)
    setFileContent(null)
    setContentError(null)
  }

  const renderFile = (file, level = 0) => {
    if (!file || !file.relativePath) {
      return null
    }

    const parts = file.relativePath.split('/')
    const fileName = parts[parts.length - 1] || file.relativePath
    const indent = level * 16
    const isSelected = selectedFile?.relativePath === file.relativePath
    const badgeColor = getLanguageBadgeColor(fileName)

    return (
      <div key={file.relativePath} className="file-item">
        <div
          className={`file-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${indent}px` }}
          onClick={() => handleFileClick(file)}
        >
          <div className="file-icon-wrapper">
            {getFileIcon(fileName)}
          </div>
          <span className="file-name">{fileName}</span>
          {badgeColor && (
            <span className="file-badge" style={{ backgroundColor: badgeColor }} />
          )}
          <span className="file-info">{formatFileSize(file.size || 0)}</span>
        </div>
      </div>
    )
  }

  const renderTree = (fileList, level = 0, currentPath = '') => {
    if (!fileList || fileList.length === 0) {
      return null
    }

    const grouped = {}

    fileList.forEach(file => {
      if (!file || !file.relativePath) return

      const parts = file.relativePath.split('/').slice(level)
      if (parts.length === 0) return

      if (parts.length === 1) {
        // 这是一个文件（在当前层级）
        const fileName = parts[0]
        if (!grouped[fileName]) {
          grouped[fileName] = file
        }
      } else if (parts.length > 1) {
        // 这是一个目录（有子路径）
        const folderName = parts[0]
        if (!folderName) return

        if (!grouped[folderName]) {
          grouped[folderName] = { type: 'folder', children: [] }
        } else if (!grouped[folderName].type || grouped[folderName].type !== 'folder') {
          // 如果这个 key 已经被文件占用，转换为文件夹
          const existingFile = grouped[folderName]
          grouped[folderName] = { type: 'folder', children: [existingFile] }
        }

        // 确保 children 是数组
        if (!Array.isArray(grouped[folderName].children)) {
          grouped[folderName].children = []
        }

        grouped[folderName].children.push(file)
      }
    })

    return Object.entries(grouped).map(([name, item]) => {
      if (item.type === 'folder') {
        const folderPath = currentPath ? `${currentPath}/${name}` : name
        const isExpanded = expandedFolders.has(folderPath)
        const fileCount = countFilesInFolder(files, folderPath)

        return (
          <div key={folderPath} className="folder-item">
            <div
              className="folder-row"
              onClick={() => toggleFolder(folderPath)}
            >
              <div className="folder-chevron">
                {isExpanded ? (
                  <ChevronDownIcon className="chevron-icon" />
                ) : (
                  <ChevronRightIcon className="chevron-icon" />
                )}
              </div>
              <div className="folder-icon-wrapper">
                {isExpanded ? (
                  <FolderOpenIcon className="folder-icon-svg" />
                ) : (
                  <FolderIcon className="folder-icon-svg" />
                )}
              </div>
              <span className="folder-name">{name}</span>
              <span className="folder-count">{fileCount}</span>
            </div>
            {isExpanded && (
              <div className="folder-children">
                {renderTree(item.children, level + 1, folderPath)}
              </div>
            )}
          </div>
        )
      } else {
        // item 是文件对象
        return renderFile(item, level)
      }
    })
  }

  if (loading) {
    return (
      <div className="workspace-tab">
        <div className="workspace-header">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-path" />
        </div>
        <div className="skeleton skeleton-summary" />
        <div className="workspace-content">
          <div className="file-list">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton skeleton-file-row" style={{ width: `${60 + Math.random() * 30}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="workspace-tab">
        <div className="error-message">
          <p>加载失败: {error}</p>
          <button onClick={fetchWorkspaceFiles}>重试</button>
        </div>
      </div>
    )
  }

  if (cleanedUp && workspace) {
    return (
      <div className="workspace-tab">
        <div className="empty-state">
          <div className="empty-icon-wrapper">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3>临时工作区已清理</h3>
          <p>此任务使用的是临时工作目录，文件已被系统清理</p>
          <code className="workspace-path" style={{ marginTop: 8, fontSize: 12 }}>{workspace}</code>
        </div>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="workspace-tab">
        <div className="empty-state">
          <div className="empty-icon-wrapper">
            <FolderIcon className="empty-state-icon" />
          </div>
          <h3>暂无 Workspace</h3>
          <p>此任务未指定 workspace 目录</p>
          <p className="empty-hint">系统将使用默认工作目录：/tmp/myagent-workspace</p>
          <p className="empty-hint">可通过 environment.workspace 参数指定自定义工作目录</p>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-tab">
      <div className="workspace-header">
        <div className="workspace-header-row">
          <h3>Workspace</h3>
          <button onClick={fetchWorkspaceFiles} className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`} disabled={isRefreshing}>
            <ArrowPathIcon className={`refresh-icon ${isRefreshing ? 'spinning' : ''}`} />
            刷新
          </button>
        </div>
        <code className="workspace-path">{workspace}</code>
      </div>

      {summary && (
        <div className="workspace-summary">
          <div className="summary-item">
            <DocumentIcon className="summary-icon" />
            <span className="summary-value">{summary.fileCount}</span>
            <span className="summary-label">文件</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-item">
            <FolderIcon className="summary-icon" />
            <span className="summary-value">{summary.dirCount}</span>
            <span className="summary-label">目录</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-item">
            <svg className="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            <span className="summary-value">{formatFileSize(summary.totalSize)}</span>
            <span className="summary-label">总大小</span>
          </div>
        </div>
      )}

      <div className="workspace-content">
        {files.length === 0 ? (
          <div className="empty-files">
            <p>Workspace 为空</p>
          </div>
        ) : (
          <div className="file-list">
            {renderTree(files)}
          </div>
        )}

        {/* 文件预览面板 */}
        {selectedFile && (
          <div className="file-preview-panel">
            <div className="preview-header">
              <div className="preview-title">
                <div className="preview-icon-wrapper">
                  {getFileIcon(selectedFile.name)}
                </div>
                <span className="preview-filename">{selectedFile.name}</span>
              </div>
              <button onClick={closePreview} className="close-preview-btn">
                <XMarkIcon className="close-icon-svg" />
              </button>
            </div>

            <div className="preview-content">
              {contentLoading && (
                <div className="preview-loading">加载中...</div>
              )}

              {contentError && (
                <div className="preview-error">
                  <p>加载失败: {contentError}</p>
                </div>
              )}

              {!contentLoading && !contentError && fileContent && (
                <>
                  {fileContent.type === 'media' && (
                    <div className="preview-media">
                      {fileContent.mimeType?.startsWith('image/') ? (
                        <img src={fileContent.url} alt={selectedFile.name} className="preview-image" />
                      ) : fileContent.mimeType?.startsWith('video/') ? (
                        <video controls src={fileContent.url} className="preview-video" />
                      ) : fileContent.mimeType?.startsWith('audio/') ? (
                        <audio controls src={fileContent.url} className="preview-audio" />
                      ) : (
                        <div className="preview-unsupported">
                          <p>不支持的媒体类型: {fileContent.mimeType}</p>
                          <a href={fileContent.url} download={selectedFile.name} className="download-link">
                            下载文件
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {fileContent.type === 'text' && (
                    <div className="preview-code">
                      <CodePlayer
                        code={fileContent.content}
                        language={getLanguage(selectedFile.name)}
                        filename={fileContent.filename}
                      />
                    </div>
                  )}

                  {fileContent.type === 'binary' && (
                    <div className="preview-binary">
                      <p>这是一个二进制文件，无法预览</p>
                      <button onClick={() => window.open(`${MEDIA_BASE_URL}/media?path=${encodeURIComponent(selectedFile.path)}`)} className="download-btn">
                        下载文件
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspaceTab
