import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './CodePlayer.css'

/**
 * CodePlayer - 代码高亮显示组件
 *
 * 用于展示代码片段，支持语法高亮和语言检测
 */
const CodePlayer = ({ code, language = 'text', filename = '' }) => {
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

  return (
    <div className="code-player-container">
      {filename && <div className="code-player-filename">{filename}</div>}
      <SyntaxHighlighter
        language={detectedLanguage}
        style={vscDarkPlus}
        showLineNumbers={true}
        wrapLines={false}
        lineProps={(lineNumber) => ({
          style: { display: 'block', cursor: 'pointer' },
          onClick: () => {
            // 复制行号功能（可选）
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
    </div>
  )
}

export default CodePlayer
