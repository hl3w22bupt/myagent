import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './CodePlayer.css'

/**
 * CodePlayer - 代码高亮显示组件
 *
 * 用于展示代码片段，支持语法高亮、语言检测和预览
 */
const CodePlayer = ({ code, language = 'text', filename = '' }) => {
  const [viewMode, setViewMode] = useState('preview') // 'code' or 'preview' - 默认显示预览
  const [copied, setCopied] = useState(false)

  if (!code) {
    return <div className="code-player-empty">无代码内容</div>
  }

  // 如果传入的是对象，尝试提取代码内容
  let codeContent = code
  let detectedLanguage = language

  if (typeof code === 'object') {
    // 尝试从对象中提取代码
    codeContent = code.content || code.code || code.text || JSON.stringify(code, null, 2)
    detectedLanguage = code.language || code.type || language
  }

  // 如果没有指定语言，尝试从文件名推断
  if (!detectedLanguage || detectedLanguage === 'text') {
    if (filename) {
      const ext = filename.split('.').pop().toLowerCase()
      const langMap = {
        'js': 'javascript',
        'jsx': 'jsx',
        'ts': 'typescript',
        'tsx': 'tsx',
        'py': 'python',
        'python': 'python',  // 支持后端生成的 .python 扩展名
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'cs': 'csharp',
        'php': 'php',
        'swift': 'swift',
        'kt': 'kotlin',
        'scala': 'scala',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'md': 'markdown',
        'sh': 'bash',
        'bash': 'bash',
        'zsh': 'bash',
        'sql': 'sql',
      }
      detectedLanguage = langMap[ext] || 'text'
    }
  }

  // 语言显示名称映射
  const languageDisplayNames = {
    'javascript': 'JavaScript',
    'jsx': 'JSX',
    'typescript': 'TypeScript',
    'tsx': 'TSX',
    'python': 'Python',
    'ruby': 'Ruby',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'csharp': 'C#',
    'php': 'PHP',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'markdown': 'Markdown',
    'bash': 'Bash',
    'sql': 'SQL',
    'text': 'Text'
  }

  const languageDisplayName = languageDisplayNames[detectedLanguage] || detectedLanguage

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // 是否支持预览（支持 HTML、SVG、Markdown）
  const supportsPreview = detectedLanguage === 'html' || detectedLanguage === 'svg' || detectedLanguage === 'markdown'

  return (
    <div className="code-player-container">
      {/* Header Bar */}
      <div className="code-player-header">
        <div className="code-player-info">
          {filename && (
            <div className="code-player-filename">
              <span className="filename-icon">📄</span>
              {filename}
            </div>
          )}
          <div className="code-player-language">
            <span className="language-badge">{languageDisplayName}</span>
          </div>
        </div>

        <div className="code-player-actions">
          {supportsPreview && (
            <div className="view-mode-toggle">
              <button
                className={`toggle-button ${viewMode === 'code' ? 'active' : ''}`}
                onClick={() => setViewMode('code')}
              >
                代码
              </button>
              <button
                className={`toggle-button ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
              >
                预览
              </button>
            </div>
          )}

          <button
            className={`copy-button ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'code' ? (
        <SyntaxHighlighter
          language={detectedLanguage}
          style={vscDarkPlus}
          showLineNumbers={true}
          wrapLines={false}
          lineProps={(lineNumber) => ({
            style: { display: 'block', cursor: 'pointer' },
            onClick: () => {
              console.log('Line clicked:', lineNumber)
            }
          })}
          customStyle={{
            margin: 0,
            borderRadius: '8px',
            fontSize: '14px',
            maxHeight: '80vh',
            overflow: 'auto',
            overflowX: 'auto',
            overflowY: 'auto',
            whiteSpace: 'pre',
            scrollbarWidth: 'thin',
            scrollbarColor: '#4a4a4a #1e1e1e'
          }}
        >
          {codeContent}
        </SyntaxHighlighter>
      ) : detectedLanguage === 'markdown' ? (
        <div className="code-player-preview markdown-preview">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ node, inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '')
                return !inline ? (
                  <SyntaxHighlighter
                    language={match ? match[1] : 'text'}
                    style={vscDarkPlus}
                    PreTag="div"
                    customStyle={{
                      borderRadius: '4px',
                      margin: '8px 0',
                      fontSize: '13px',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {codeContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="code-player-preview">
          <iframe
            srcDoc={codeContent}
            sandbox="allow-scripts allow-same-origin"
            title="Preview"
            className="preview-iframe"
          />
        </div>
      )}
    </div>
  )
}

export default CodePlayer
