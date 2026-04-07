import { useState, useEffect } from 'react'
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

const WorkspaceTab = ({ taskId }) => {
  const [workspace, setWorkspace] = useState(null)
  const [files, setFiles] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState(null)

  useEffect(() => {
    fetchWorkspaceFiles()
  }, [taskId])

  const fetchWorkspaceFiles = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspace/${taskId}`)
      const data = await response.json()

      if (data.success) {
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
      setError(err.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }

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
      const url = `${API_BASE_URL}/media?path=${encodeURIComponent(file.path)}`
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
    return <div className="workspace-tab">加载中...</div>
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

  if (!workspace) {
    return (
      <div className="workspace-tab">
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>暂无 Workspace</h3>
          <p>只有通过 ExternalAgent 执行的任务才会有 workspace 目录</p>
          <p className="empty-hint">如果这是 ExternalAgent 任务，请等待任务执行完成后刷新查看</p>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-tab">
      <div className="workspace-header">
        <h3>Workspace</h3>
        <code className="workspace-path">{workspace}</code>
        <button onClick={fetchWorkspaceFiles} className="refresh-btn">
          <ArrowPathIcon className="refresh-icon" />
          刷新
        </button>
      </div>

      {summary && (
        <div className="workspace-summary">
          <span>📄 {summary.fileCount} 文件</span>
          <span>📁 {summary.dirCount} 目录</span>
          <span>💾 {formatFileSize(summary.totalSize)}</span>
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
                      <button onClick={() => window.open(`${API_BASE_URL}/media?path=${encodeURIComponent(selectedFile.path)}`)} className="download-btn">
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
