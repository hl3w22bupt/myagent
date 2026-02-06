import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './HtmlRenderer.css'

/**
 * HtmlRenderer - HTML/Markdown 渲染组件
 *
 * 用于渲染 HTML 和 Markdown 内容
 */
const HtmlRenderer = ({ content, type = 'markdown', filename = '' }) => {
  if (!content) {
    return <div className="html-renderer-empty">无内容</div>
  }

  // 如果传入的是对象，尝试提取内容
  let renderContent = content
  let renderType = type

  if (typeof content === 'object') {
    renderContent = content.content || content.text || content.html || JSON.stringify(content)
    // 尝试从对象中推断类型
    if (content.type) {
      renderType = content.type
    }
  }

  // 渲染 Markdown
  if (renderType === 'markdown') {
    return (
      <div className="html-renderer-container">
        {filename && <div className="html-renderer-filename">📝 {filename}</div>}
        <div className="html-renderer-content html-renderer-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // 自定义代码块渲染
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline ? (
                  <pre className={className}>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
              // 自定义链接渲染
              a({ node, children, ...props }) {
                return (
                  <a target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>
                )
              }
            }}
          >
            {renderContent}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  // 渲染 HTML
  if (renderType === 'html') {
    return (
      <div className="html-renderer-container">
        {filename && <div className="html-renderer-filename">🌐 {filename}</div>}
        <div
          className="html-renderer-content html-renderer-html"
          dangerouslySetInnerHTML={{ __html: renderContent }}
        />
      </div>
    )
  }

  // 默认渲染为纯文本
  return (
    <div className="html-renderer-container">
      {filename && <div className="html-renderer-filename">📄 {filename}</div>}
      <div className="html-renderer-content html-renderer-text">
        <pre>{renderContent}</pre>
      </div>
    </div>
  )
}

export default HtmlRenderer
