import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksAPI } from '../services/api'
import './Submit.css'

function Submit() {
  const navigate = useNavigate()
  const [taskContent, setTaskContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!taskContent.trim()) {
      setError('请输入任务内容')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await tasksAPI.submitTask(taskContent.trim())

      if (response.data && response.data.taskId) {
        // 任务提交成功，跳转到任务详情页
        navigate(`/tasks/${response.data.taskId}`)
      } else {
        setError('任务提交成功，但返回数据格式不正确')
      }
    } catch (error) {
      console.error('Error submitting task:', error)
      setError('任务提交失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="submit">
      <div className="submit-header">
        <h1>任务提交</h1>
        <p>请输入您的任务描述</p>
      </div>

      <div className="submit-content">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="submit-form">
          <div className="form-group">
            <label htmlFor="task-content">任务内容</label>
            <textarea
              id="task-content"
              value={taskContent}
              onChange={(e) => setTaskContent(e.target.value)}
              placeholder="请输入您的任务描述，例如：总结这篇文章...，或者生成一张图表..."
              rows={8}
              className="task-input"
              disabled={loading}
            />
            <div className="input-hint">
              任务内容应清晰描述您的需求，系统会自动识别并选择合适的技能来处理。
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="submit-button"
              disabled={loading || !taskContent.trim()}
            >
              {loading ? (
                <span className="loading-text">
                  <span className="spinner"></span>
                  提交中...
                </span>
              ) : (
                '提交任务'
              )}
            </button>
          </div>
        </form>

        <div className="tips-section">
          <h2>任务提交提示</h2>
          <ul className="tips-list">
            <li>
              <strong>清晰明确:</strong> 任务描述应尽可能详细，包含您想要的结果格式。
            </li>
            <li>
              <strong>结果格式:</strong> 您可以指定返回格式，如"表格"、"图片"、"视频"等。
            </li>
            <li>
              <strong>技能选择:</strong> 系统会自动选择合适的技能，但您也可以在任务描述中指定。
            </li>
            <li>
              <strong>处理时间:</strong> 任务处理时间取决于任务复杂度，一般在几秒钟到几分钟之间。
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Submit