import { useState, useEffect } from 'react'
import { getWorkflows, getWorkflowDetail } from '../services/workflowService'
import WorkflowDAG from '../components/workflows/WorkflowDAG'
import WorkflowDetailModal from '../components/workflows/WorkflowDetailModal'
import './Workflows.css'

function Workflows() {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedWorkflow, setSelectedWorkflow] = useState(null)
  const [selectedWorkflowDetail, setSelectedWorkflowDetail] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)
  const [showDAG, setShowDAG] = useState(false)
  const [showYAML, setShowYAML] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const itemsPerPage = 8

  // Load workflows on mount
  useEffect(() => {
    loadWorkflows()
  }, [])

  // Load workflows from API
  const loadWorkflows = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getWorkflows()
      setWorkflows(data)
    } catch (err) {
      setError(err.message || 'Failed to load workflows')
      console.error('Error loading workflows:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle visualize button click
  const handleVisualize = async (workflow) => {
    console.log('🖼️ Opening DAG for workflow:', workflow.name)
    setSelectedWorkflow(workflow)
    setLoadingDetail(true)
    setShowDAG(true)

    try {
      const detail = await getWorkflowDetail(workflow.name)
      console.log('✅ Workflow detail loaded:', detail)
      setSelectedWorkflowDetail(detail)
    } catch (err) {
      console.error('❌ Error loading workflow detail:', err)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Handle node click in DAG
  const handleNodeClick = (step) => {
    setSelectedStep(step)
  }

  // Close DAG modal
  const handleCloseDAG = () => {
    setShowDAG(false)
    setSelectedWorkflow(null)
    setSelectedWorkflowDetail(null)
    setSelectedStep(null)
  }

  // Handle YAML config button click
  const handleShowYAML = async (workflow) => {
    console.log('📄 Opening YAML config for workflow:', workflow.name)
    setSelectedWorkflow(workflow)
    setLoadingDetail(true)
    setShowYAML(true)

    try {
      const detail = await getWorkflowDetail(workflow.name)
      console.log('✅ Workflow detail loaded for YAML:', detail)
      setSelectedWorkflowDetail(detail)
    } catch (err) {
      console.error('❌ Error loading workflow detail for YAML:', err)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Close YAML modal
  const handleCloseYAML = () => {
    setShowYAML(false)
    setSelectedWorkflow(null)
    setSelectedWorkflowDetail(null)
  }

  // Filter workflows by search term
  const filteredWorkflows = workflows.filter(workflow =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (workflow.description && workflow.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Pagination logic
  const totalPages = Math.ceil(filteredWorkflows.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedWorkflows = filteredWorkflows.slice(startIndex, endIndex)

  // Reset page when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  return (
    <div className="workflows-page">
      <div className="workflows-actions">
        <button
          className="btn-refresh"
          onClick={loadWorkflows}
          disabled={loading}
        >
          {loading ? '加载中...' : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.991" />
              </svg>
              <span>刷新</span>
            </>
          )}
        </button>

        <div className="search-input-wrapper">
          <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索工作流..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="workflow-count">
          共 {filteredWorkflows.length} 个工作流
          {filteredWorkflows.length > itemsPerPage && (
            <span className="pagination-info"> · 第 {currentPage} / {totalPages} 页</span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
          <button onClick={loadWorkflows} className="btn-retry">重试</button>
        </div>
      )}

      {!loading && !error && filteredWorkflows.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>没有找到工作流</h3>
          <p>{searchTerm ? '尝试使用其他搜索词' : '暂无可用的 workflows'}</p>
        </div>
      )}

      {!loading && !error && filteredWorkflows.length > 0 && (
        <div className="workflows-table-container">
          <table className="workflows-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>描述</th>
                <th>步骤数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWorkflows.map((workflow, index) => (
                <tr key={workflow.name || index}>
                  <td className="workflow-name">
                    <strong>{workflow.name}</strong>
                  </td>
                  <td className="workflow-description">
                    {workflow.description || '无描述'}
                  </td>
                  <td className="workflow-steps">
                    <span className="step-badge">
                      {workflow.step_count || '?'} 步骤
                    </span>
                  </td>
                  <td className="workflow-actions">
                    <button
                      className="btn-visualize"
                      onClick={() => handleVisualize(workflow)}
                      title="查看 DAG 可视化"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px', marginRight: '6px' }}>
                        {/* Node 1 - Top */}
                        <circle cx="12" cy="4" r="1.8" fill="currentColor" />
                        {/* Node 2 - Middle Left */}
                        <circle cx="6" cy="12" r="1.8" fill="currentColor" />
                        {/* Node 3 - Middle Right */}
                        <circle cx="18" cy="12" r="1.8" fill="currentColor" />
                        {/* Node 4 - Bottom */}
                        <circle cx="12" cy="20" r="1.8" fill="currentColor" />
                        {/* Arrows showing flow */}
                        <path d="M12 5.8 L8 8.8" stroke="currentColor" strokeLinecap="round" />
                        <path d="M12 5.8 L16 8.8" stroke="currentColor" strokeLinecap="round" />
                        <path d="M6 13.8 L10 17.2" stroke="currentColor" strokeLinecap="round" />
                        <path d="M18 13.8 L14 17.2" stroke="currentColor" strokeLinecap="round" />
                        {/* Arrow heads */}
                        <path d="M8 8.8 L8.8 8.3 L8 7.8" stroke="currentColor" strokeLinecap="round" fill="currentColor" />
                        <path d="M16 8.8 L15.2 8.3 L16 7.8" stroke="currentColor" strokeLinecap="round" fill="currentColor" />
                        <path d="M10 17.2 L10.8 16.7 L10 16.2" stroke="currentColor" strokeLinecap="round" fill="currentColor" />
                        <path d="M14 17.2 L13.2 16.7 L14 16.2" stroke="currentColor" strokeLinecap="round" fill="currentColor" />
                      </svg>
                      可视化
                    </button>
                    <button
                      className="btn-yaml"
                      onClick={() => handleShowYAML(workflow)}
                      title="查看 YAML 配置"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '18px', height: '18px', marginRight: '6px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      YAML配置
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination-container">
          <button
            className="pagination-button"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            上一页
          </button>

          <div className="pagination-pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            className="pagination-button"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            下一页
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* DAG Modal */}
      {showDAG && selectedWorkflow && (
        <div className="dag-modal-overlay" onClick={handleCloseDAG}>
          <div className="dag-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="dag-modal-header">
              <h2>
                工作流 DAG: {selectedWorkflow.name}
                {loadingDetail && <span className="loading-badge">加载中...</span>}
              </h2>
              <button
                className="btn-close"
                onClick={handleCloseDAG}
              >
                ✕
              </button>
            </div>
            <div className="dag-modal-body">
              {loadingDetail ? (
                <div className="dag-loading">
                  <div className="spinner"></div>
                  <p>加载 workflow 详情中...</p>
                </div>
              ) : selectedWorkflowDetail ? (
                <WorkflowDAG
                  workflow={selectedWorkflowDetail}
                  onNodeClick={handleNodeClick}
                />
              ) : (
                <div className="dag-error">
                  <p>无法加载 workflow 详情</p>
                  <button onClick={handleCloseDAG} className="btn-close-dag">关闭</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* YAML Config Modal */}
      {showYAML && selectedWorkflow && (
        <div className="dag-modal-overlay" onClick={handleCloseYAML}>
          <div className="dag-modal-content yaml-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="dag-modal-header">
              <h2>
                YAML 配置: {selectedWorkflow.name}
                {loadingDetail && <span className="loading-badge">加载中...</span>}
              </h2>
              <button
                className="btn-close"
                onClick={handleCloseYAML}
              >
                ✕
              </button>
            </div>
            <div className="dag-modal-body yaml-modal-body">
              {loadingDetail ? (
                <div className="dag-loading">
                  <div className="spinner"></div>
                  <p>加载 YAML 配置中...</p>
                </div>
              ) : selectedWorkflowDetail?.yaml ? (
                <pre className="yaml-code-block">
                  <code>{selectedWorkflowDetail.yaml}</code>
                </pre>
              ) : (
                <div className="dag-error">
                  <p>无法加载 YAML 配置</p>
                  <button onClick={handleCloseYAML} className="btn-close-dag">关闭</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step Detail Modal */}
      {selectedStep && (
        <WorkflowDetailModal
          workflowName={selectedWorkflow?.name}
          step={selectedStep}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  )
}

export default Workflows
