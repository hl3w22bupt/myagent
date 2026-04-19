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

  useEffect(() => {
    loadWorkflows()
  }, [])

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

  const handleVisualize = async (workflow) => {
    setSelectedWorkflow(workflow)
    setLoadingDetail(true)
    setShowDAG(true)
    try {
      const detail = await getWorkflowDetail(workflow.id || workflow.name)
      setSelectedWorkflowDetail(detail)
    } catch (err) {
      console.error('Error loading workflow detail:', err)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleNodeClick = (step) => {
    setSelectedStep(step)
  }

  const handleCloseDAG = () => {
    setShowDAG(false)
    setSelectedWorkflow(null)
    setSelectedWorkflowDetail(null)
    setSelectedStep(null)
  }

  const handleShowYAML = async (workflow) => {
    setSelectedWorkflow(workflow)
    setLoadingDetail(true)
    setShowYAML(true)
    try {
      const detail = await getWorkflowDetail(workflow.id || workflow.name)
      setSelectedWorkflowDetail(detail)
    } catch (err) {
      console.error('Error loading workflow detail for YAML:', err)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCloseYAML = () => {
    setShowYAML(false)
    setSelectedWorkflow(null)
    setSelectedWorkflowDetail(null)
  }

  const filteredWorkflows = workflows.filter(workflow =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (workflow.description && workflow.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const totalPages = Math.ceil(filteredWorkflows.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedWorkflows = filteredWorkflows.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  return (
    <div className="workflows-page">
      {/* Page Header */}
      <div className="workflows-header">
        <div className="workflows-header-left">
          <h1 className="workflows-title">
            <svg className="workflows-title-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
            </svg>
            工作流
          </h1>
          <p className="workflows-subtitle">管理和可视化工作流配置</p>
        </div>
        <div className="workflows-header-right">
          {!loading && (
            <span className="workflows-stats-badge">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              {filteredWorkflows.length} 个工作流
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="workflows-toolbar">
        <div className="workflows-search-wrapper">
          <svg className="workflows-search-icon" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索工作流名称或描述..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="workflows-search-input"
          />
          {searchTerm && (
            <button
              className="workflows-search-clear"
              onClick={() => setSearchTerm('')}
              aria-label="清除搜索"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          className="workflows-btn-refresh"
          onClick={loadWorkflows}
          disabled={loading}
          title="刷新工作流列表"
        >
          <svg
            className={loading ? 'spin-icon' : ''}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            width="18"
            height="18"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.991" />
          </svg>
          <span>{loading ? '加载中...' : '刷新'}</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="workflows-error">
          <div className="workflows-error-icon">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <span className="workflows-error-text">{error}</span>
          <button onClick={loadWorkflows} className="workflows-error-retry">重试</button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredWorkflows.length === 0 && (
        <div className="workflows-empty">
          <svg className="workflows-empty-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <h3 className="workflows-empty-title">
            {searchTerm ? '没有匹配的工作流' : '暂无工作流'}
          </h3>
          <p className="workflows-empty-desc">
            {searchTerm ? '尝试使用其他搜索词' : '工作流列表为空，请先配置工作流'}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="workflows-loading">
          <div className="workflows-loading-spinner" />
          <span>加载工作流...</span>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filteredWorkflows.length > 0 && (
        <>
          <div className="workflows-table-container">
            <table className="workflows-table">
              <thead>
                <tr>
                  <th className="th-id">ID</th>
                  <th className="th-name">名称</th>
                  <th className="th-desc">描述</th>
                  <th className="th-steps">步骤</th>
                  <th className="th-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWorkflows.map((workflow, index) => (
                  <tr key={workflow.id || workflow.name || index} className="workflow-row">
                    <td className="td-id">
                      <code className="wf-id-badge">{workflow.id || '-'}</code>
                    </td>
                    <td className="td-name">
                      <span className="wf-name">{workflow.name}</span>
                    </td>
                    <td className="td-desc">
                      <span className="wf-desc">{workflow.description || '无描述'}</span>
                    </td>
                    <td className="td-steps">
                      <span className="wf-step-badge">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                        </svg>
                        {workflow.step_count || '?'}
                      </span>
                    </td>
                    <td className="td-actions">
                      <button
                        className="wf-action-btn wf-action-dag"
                        onClick={() => handleVisualize(workflow)}
                        title="查看 DAG 可视化"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <circle cx="12" cy="4" r="1.8" fill="currentColor" />
                          <circle cx="6" cy="12" r="1.8" fill="currentColor" />
                          <circle cx="18" cy="12" r="1.8" fill="currentColor" />
                          <circle cx="12" cy="20" r="1.8" fill="currentColor" />
                          <path d="M12 5.8 L8 8.8" stroke="currentColor" strokeLinecap="round" />
                          <path d="M12 5.8 L16 8.8" stroke="currentColor" strokeLinecap="round" />
                          <path d="M6 13.8 L10 17.2" stroke="currentColor" strokeLinecap="round" />
                          <path d="M18 13.8 L14 17.2" stroke="currentColor" strokeLinecap="round" />
                        </svg>
                        <span>可视化</span>
                      </button>
                      <button
                        className="wf-action-btn wf-action-yaml"
                        onClick={() => handleShowYAML(workflow)}
                        title="查看 YAML 配置"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span>YAML</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="workflows-pagination">
              <button
                className="wf-page-btn"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                上一页
              </button>

              <div className="wf-page-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={`wf-page-num ${currentPage === page ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                className="wf-page-btn"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                下一页
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* DAG Modal */}
      {showDAG && selectedWorkflow && (
        <div className="wf-modal-overlay" onClick={handleCloseDAG}>
          <div className="wf-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="wf-modal-header">
              <div className="wf-modal-title-group">
                <h2 className="wf-modal-title">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <circle cx="12" cy="4" r="1.8" fill="currentColor" />
                    <circle cx="6" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="18" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="12" cy="20" r="1.8" fill="currentColor" />
                    <path d="M12 5.8 L8 8.8" stroke="currentColor" strokeLinecap="round" />
                    <path d="M12 5.8 L16 8.8" stroke="currentColor" strokeLinecap="round" />
                  </svg>
                  {selectedWorkflow.name}
                </h2>
                {loadingDetail && <span className="wf-loading-pill">加载中...</span>}
              </div>
              <button className="wf-modal-close" onClick={handleCloseDAG} aria-label="关闭">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="wf-modal-body">
              {loadingDetail ? (
                <div className="wf-modal-loading">
                  <div className="wf-modal-spinner" />
                  <p>加载工作流详情...</p>
                </div>
              ) : selectedWorkflowDetail ? (
                <WorkflowDAG
                  workflow={selectedWorkflowDetail}
                  onNodeClick={handleNodeClick}
                />
              ) : (
                <div className="wf-modal-error">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p>无法加载工作流详情</p>
                  <button onClick={handleCloseDAG} className="wf-modal-error-btn">关闭</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* YAML Modal */}
      {showYAML && selectedWorkflow && (
        <div className="wf-modal-overlay" onClick={handleCloseYAML}>
          <div className="wf-modal-content wf-modal-yaml" onClick={(e) => e.stopPropagation()}>
            <div className="wf-modal-header">
              <div className="wf-modal-title-group">
                <h2 className="wf-modal-title">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {selectedWorkflow.name}
                </h2>
                {loadingDetail && <span className="wf-loading-pill">加载中...</span>}
              </div>
              <button className="wf-modal-close" onClick={handleCloseYAML} aria-label="关闭">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="wf-modal-body wf-modal-yaml-body">
              {loadingDetail ? (
                <div className="wf-modal-loading">
                  <div className="wf-modal-spinner" />
                  <p>加载 YAML 配置...</p>
                </div>
              ) : selectedWorkflowDetail?.yaml ? (
                <pre className="wf-yaml-block">
                  <code>{selectedWorkflowDetail.yaml}</code>
                </pre>
              ) : (
                <div className="wf-modal-error">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p>无法加载 YAML 配置</p>
                  <button onClick={handleCloseYAML} className="wf-modal-error-btn">关闭</button>
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
