import { getWorkflowDetail } from '../../services/workflowService'
import { useState, useEffect } from 'react'
import './WorkflowDetailModal.css'

function WorkflowDetailModal({ workflowName, step, onClose }) {
  const [workflow, setWorkflow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (workflowName) {
      loadWorkflowDetail()
    }
  }, [workflowName])

  const loadWorkflowDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const detail = await getWorkflowDetail(workflowName)
      setWorkflow(detail)
    } catch (err) {
      setError(err.message || 'Failed to load workflow details')
      console.error('Error loading workflow detail:', err)
    } finally {
      setLoading(false)
    }
  }

  if (step) {
    // Show step details
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>步骤详情</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <div className="detail-section">
              <h3>基本信息</h3>
              <div className="detail-row">
                <span className="detail-label">ID:</span>
                <span className="detail-value">{step.id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">名称:</span>
                <span className="detail-value">{step.name || step.id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">类型:</span>
                <span className="detail-value badge">{step.type || 'agent'}</span>
              </div>
            </div>

            {step.agent && (
              <div className="detail-section">
                <h3>Agent 配置</h3>
                <div className="detail-row">
                  <span className="detail-label">Agent:</span>
                  <span className="detail-value">{step.agent}</span>
                </div>
                {step.input && (
                  <div className="detail-row">
                    <span className="detail-label">输入:</span>
                    <pre className="detail-code">{JSON.stringify(step.input, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {step.hitl && (
              <div className="detail-section">
                <h3>HITL 配置</h3>
                <div className="detail-row">
                  <span className="detail-label">问题:</span>
                  <span className="detail-value">{step.hitl.question}</span>
                </div>
                {step.hitl.options && (
                  <div className="detail-row">
                    <span className="detail-label">选项:</span>
                    <div className="hitl-options">
                      {step.hitl.options.map((opt, i) => (
                        <div key={i} className="hitl-option">
                          <strong>{opt.label}:</strong> {opt.description || opt.action}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step.depends_on && step.depends_on.length > 0 && (
              <div className="detail-section">
                <h3>依赖关系</h3>
                <div className="detail-row">
                  <span className="detail-label">依赖于:</span>
                  <div className="dependency-list">
                    {step.depends_on.map((dep, i) => (
                      <span key={i} className="dependency-badge">{dep}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body loading">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>错误</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <div className="error-message">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>工作流详情: {workflow.name}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="detail-section">
            <h3>基本信息</h3>
            <div className="detail-row">
              <span className="detail-label">名称:</span>
              <span className="detail-value">{workflow.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">描述:</span>
              <span className="detail-value">{workflow.description || '无描述'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">步骤数:</span>
              <span className="detail-value">{workflow.step_count || workflow.steps?.length || 0}</span>
            </div>
          </div>

          {workflow.input_schema && (
            <div className="detail-section">
              <h3>输入 Schema</h3>
              <pre className="schema-code">{JSON.stringify(workflow.input_schema, null, 2)}</pre>
            </div>
          )}

          {workflow.output_schema && (
            <div className="detail-section">
              <h3>输出 Schema</h3>
              <pre className="schema-code">{JSON.stringify(workflow.output_schema, null, 2)}</pre>
            </div>
          )}

          {workflow.steps && workflow.steps.length > 0 && (
            <div className="detail-section">
              <h3>步骤列表</h3>
              <div className="steps-list">
                {workflow.steps.map((step, index) => (
                  <div key={step.id} className="step-item">
                    <div className="step-header">
                      <span className="step-index">{index + 1}</span>
                      <strong>{step.name || step.id}</strong>
                      <span className={`step-type-badge ${step.type || 'agent'}`}>
                        {step.type || 'agent'}
                      </span>
                    </div>
                    {step.agent && (
                      <div className="step-detail">Agent: {step.agent}</div>
                    )}
                    {step.depends_on && step.depends_on.length > 0 && (
                      <div className="step-detail">
                        依赖: {step.depends_on.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WorkflowDetailModal
