import { useState, useEffect, useCallback } from 'react'
import './Knowledge.css'

// 可搜索下拉框组件（移到组件外部避免重新创建）
const SearchableSelect = ({ label, value, onChange, options, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState(value || '')
  const inputRef = useState(null)[0]

  // 当外部value变化时，更新内部state
  useEffect(() => {
    setSearchTerm(value || '')
  }, [value])

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setSearchTerm(newValue)
    onChange(newValue)
  }

  const handleOptionClick = (option) => {
    setSearchTerm(option)
    onChange(option)
    setIsOpen(false)
    // 让输入框保持焦点
    setTimeout(() => {
      if (inputRef?.current) {
        inputRef.current.focus()
      }
    }, 0)
  }

  return (
    <div className="searchable-select">
      <label>{label}</label>
      <div className="searchable-select-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="searchable-select-input"
          placeholder={placeholder}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // 延迟关闭，让点击事件先触发
            setTimeout(() => setIsOpen(false), 200)
          }}
        />
        {isOpen && filteredOptions.length > 0 && (
          <div className="searchable-select-dropdown">
            {filteredOptions.map((option, index) => (
              <div
                key={index}
                className="searchable-select-option"
                onMouseDown={() => handleOptionClick(option)}
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Knowledge() {
  const [collections, setCollections] = useState([])
  const [dataSources, setDataSources] = useState([])
  const [availableApps, setAvailableApps] = useState([])
  const [discoveredCollections, setDiscoveredCollections] = useState({})
  const [loading, setLoading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(null) // 移除这个状态，不再需要
  const [showAddSource, setShowAddSource] = useState(false)
  const [newSource, setNewSource] = useState({
    name: '',
    host: 'localhost',
    port: 5432,
    database: 'myagent',
    user: 'leo',
    password: ''
  })
  const [showAppDropdown, setShowAppDropdown] = useState({})
  const [showCollectionAppSelector, setShowCollectionAppSelector] = useState({})
  const [selectedAppFilter, setSelectedAppFilter] = useState('all')
  const [message, setMessage] = useState(null)
  const [fieldMappings, setFieldMappings] = useState({}) // 存储字段映射配置
  const [tableSchemas, setTableSchemas] = useState({}) // 存储表结构信息
  const [fieldSearchTerms, setFieldSearchTerms] = useState({}) // 存储字段搜索词
  const [selectedAppsForMapping, setSelectedAppsForMapping] = useState({}) // 存储每个知识库选中的app
  const [showEditDialog, setShowEditDialog] = useState({}) // 控制编辑对话框显示
  const [editForm, setEditForm] = useState({}) // 存储编辑表单数据

  const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

  // 获取可用的应用列表
  const fetchAvailableApps = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/apps`)
      const data = await response.json()
      if (data.success) {
        setAvailableApps(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch available apps:', error)
    }
  }

  // 获取表结构信息
  const fetchTableSchema = async (tableName) => {
    try {
      const response = await fetch(`${API_BASE}/api/knowledge/table-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName })
      })
      const data = await response.json()
      if (data.success) {
        setTableSchemas(prev => ({
          ...prev,
          [tableName]: data.data.columns
        }))
        return data.data.columns
      }
    } catch (error) {
      console.error(`Failed to fetch schema for ${tableName}:`, error)
    }
    return []
  }

  // 优化的字段映射处理函数
  const handleContentFieldChange = useCallback((sourceId, collectionName) => (value) => {
    const key = `${sourceId}-${collectionName}`
    setFieldMappings(prev => ({
      ...prev,
      [key]: { ...prev[key], contentField: value }
    }))
  }, [])

  const handleEmbeddingFieldChange = useCallback((sourceId, collectionName) => (value) => {
    const key = `${sourceId}-${collectionName}`
    setFieldMappings(prev => ({
      ...prev,
      [key]: { ...prev[key], embeddingField: value }
    }))
  }, [])

  const handleThresholdChange = useCallback((sourceId, collectionName) => (value) => {
    const key = `${sourceId}-${collectionName}`
    setFieldMappings(prev => ({
      ...prev,
      [key]: { ...prev[key], threshold: parseFloat(value) || 0.7 }
    }))
  }, [])

  const fetchDataSources = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/knowledge/datasources`)
      const data = await response.json()
      if (data.success) {
        const sources = data.data || []
        setDataSources(sources)

        // 自动获取每个数据源的集合
        for (const source of sources) {
          try {
            const collResponse = await fetch(`${API_BASE}/api/knowledge/datasources/${source.id}/collections`)
            const collData = await collResponse.json()
            if (collData.success) {
              setDiscoveredCollections(prev => ({
                ...prev,
                [source.id]: collData.data.collections || []
              }))
            }
          } catch (error) {
            console.error(`Failed to fetch collections for ${source.id}:`, error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch data sources:', error)
    }
  }

  const fetchAllCollections = async () => {
    const allAppIds = dataSources.flatMap(ds => ds.appIds || [])
    if (allAppIds.length === 0) {
      setCollections([])
      return
    }

    setLoading(true)
    try {
      const promises = allAppIds.map(async (appId) => {
        const response = await fetch(
          `${API_BASE}/api/apps/${appId}/knowledge-collections?tenantId=default`
        )
        const data = await response.json()
        if (data.success) {
          return (data.data || []).map(c => ({ ...c, appId }))
        }
        return []
      })

      const results = await Promise.all(promises)
      setCollections(results.flat())
    } catch (error) {
      console.error('Failed to fetch collections:', error)
    } finally {
      setLoading(false)
    }
  }

  const testDataSource = async (sourceId) => {
    setTestingConnection(sourceId)
    try {
      const response = await fetch(`${API_BASE}/api/knowledge/datasources/${sourceId}/test`, {
        method: 'POST'
      })
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: '连接测试成功' })
        fetchDataSources()
      } else {
        setMessage({ type: 'error', text: data.message || '连接测试失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setTestingConnection(null)
    }
  }

  const discoverCollections = async (sourceId) => {
    // 这个函数已弃用，集合在加载数据源时自动获取
    console.log('Collections are auto-loaded')
  }

  const addDataSource = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/knowledge/datasources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSource.name,
          type: 'postgres-pgvector',
          connection: {
            host: newSource.host,
            port: parseInt(newSource.port),
            database: newSource.database,
            user: newSource.user || undefined,
            password: newSource.password || undefined
          }
        })
      })
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: '数据源添加成功' })
        setShowAddSource(false)
        setNewSource({
          name: '',
          host: 'localhost',
          port: 5432,
          database: 'myagent',
          user: 'leo',
          password: ''
        })
        fetchDataSources()
      } else {
        setMessage({ type: 'error', text: data.error || '添加失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  const deleteDataSource = async (sourceId, sourceName) => {
    if (!window.confirm(`确定要删除数据源 "${sourceName}" 吗？`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/knowledge/datasources/${sourceId}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: '数据源删除成功' })
        fetchDataSources()
      } else {
        setMessage({ type: 'error', text: data.error || '删除失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  const updateDataSourceApps = async (sourceId, appIds) => {
    // 乐观更新：立即更新本地状态
    setDataSources(prev =>
      prev.map(ds =>
        ds.id === sourceId ? { ...ds, appIds } : ds
      )
    )

    try {
      const response = await fetch(`${API_BASE}/api/knowledge/datasources/${sourceId}/apps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appIds: appIds.filter(Boolean) })
      })
      const data = await response.json()
      if (!data.success) {
        // 失败时才回滚
        fetchDataSources()
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
      // 成功就不做任何事，保持乐观更新的状态
    } catch (error) {
      // 失败时回滚
      fetchDataSources()
      setMessage({ type: 'error', text: '网络错误' })
    }
  }

  const addCollection = async (collectionName, appId, contentField = 'content', embeddingField = 'embedding', threshold = 0.7) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/apps/${appId}/knowledge-collections/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'default',
          collectionName,
          contentField,
          embeddingField,
          threshold,
          enabled: true,
          priority: 0
        })
      })
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: `已添加知识库` })
        fetchAllCollections()
      } else {
        setMessage({ type: 'error', text: data.error || '添加失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  const removeCollection = async (collectionName, appId) => {
    if (!confirm(`确定要移除知识库 "${collectionName}" 吗？`)) return

    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/apps/${appId}/knowledge-collections/${collectionName}?tenantId=default`,
        { method: 'DELETE' }
      )
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: '知识库移除成功' })
        fetchAllCollections()
      } else {
        setMessage({ type: 'error', text: data.error || '移除失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  const updateCollection = async (appId, collectionName, contentField, embeddingField, threshold) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/apps/${appId}/knowledge-collections/${collectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentField,
          embeddingField,
          threshold,
          enabled: true,
          priority: 0
        })
      })
      const data = await response.json()
      if (data.success) {
        setMessage({ type: 'success', text: '知识库配置更新成功' })
        fetchAllCollections()
        return true
      } else {
        setMessage({ type: 'error', text: data.error || '更新失败' })
        return false
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      return false
    } finally {
      setLoading(false)
    }
  }

  const toggleCollectionStatus = async (collectionName, currentStatus, appId) => {
    setLoading(true)
    try {
      const collection = collections.find(c => c.tableName === collectionName && c.appId === appId)
      const response = await fetch(`${API_BASE}/api/apps/${appId}/knowledge-collections/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'default',
          collectionName,
          enabled: !currentStatus,
          priority: collection?.priority || 0
        })
      })
      const data = await response.json()
      if (data.success) {
        fetchAllCollections()
      } else {
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  const isCollectionLinked = (collectionName) => {
    return collections.some(c => c.tableName === collectionName)
  }

  useEffect(() => {
    fetchDataSources()
    fetchAvailableApps()
  }, [])

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 关闭数据源的应用下拉框
      const dropdowns = document.querySelectorAll('.multi-select-dropdown')
      dropdowns.forEach(dropdown => {
        if (!dropdown.contains(event.target)) {
          const sourceId = dropdown.closest('[data-source-id]')?.dataset.sourceId
          if (sourceId && showAppDropdown[sourceId]) {
            setShowAppDropdown(prev => ({ ...prev, [sourceId]: false }))
          }
        }
      })

      // 关闭知识库的应用选择器下拉框
      const appSelectors = document.querySelectorAll('.app-selector-dropdown')
      appSelectors.forEach(selector => {
        if (!selector.contains(event.target)) {
          // 找到对应的 knowledge card 并关闭选择器
          const knowledgeCard = selector.closest('.collection-item-expanded')
          if (knowledgeCard) {
            // 从 DOM 中获取 key 的信息
            const clickTarget = event.target
            // 简化：关闭所有打开的选择器
            setShowCollectionAppSelector(prev => {
              const newState = { ...prev }
              Object.keys(newState).forEach(key => {
                if (newState[key] && !selector.contains(document.body)) {
                  // 如果点击不在选择器内，关闭它
                  const selectorEl = document.querySelector(`.app-selector-dropdown`)
                  if (selectorEl && !selectorEl.contains(clickTarget)) {
                    newState[key] = false
                  }
                }
              })
              return newState
            })
          }
        }
      })
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (dataSources.length > 0) {
      fetchAllCollections()
    }
  }, [dataSources])

  return (
    <div className="knowledge-page">
      {/* Message Banner */}
      {message && (
        <div className={`message-banner message-${message.type}`}>
          <span>{message.text}</span>
          <button className="message-close" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      {/* Page Header with Actions */}
      <div className="page-header-section">
        <div className="page-title-section">
          <h1 className="page-title">
            <svg className="page-title-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            知识库
          </h1>
          <p className="page-subtitle">配置数据源并关联到应用</p>
        </div>
        <div className="page-header-actions">
          <button
            className={`btn-primary ${showAddSource ? 'btn-active' : ''}`}
            onClick={() => setShowAddSource(!showAddSource)}
          >
            <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {showAddSource ? '取消' : '添加数据源'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">
            <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">数据源</div>
            <div className="stat-value">{dataSources.length}</div>
          </div>
        </div>
        <div className="stat-card stat-active">
          <div className="stat-icon">
            <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">知识库集合</div>
            <div className="stat-value">{new Set(collections.map(c => c.tableName)).size}</div>
          </div>
        </div>
        <div className="stat-card stat-busy">
          <div className="stat-icon">
            <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">关联应用</div>
            <div className="stat-value">
              {new Set(collections.map(c => c.appId)).size}
            </div>
          </div>
        </div>
      </div>

      {/* Add Data Source Form */}
      {showAddSource && (
        <div className="card">
          <div className="card-header">
            <h3>添加新数据源</h3>
            <button className="btn-close" onClick={() => setShowAddSource(false)}>✕</button>
          </div>
          <form onSubmit={addDataSource} className="form-content">
            <div className="form-grid">
              <div className="form-field">
                <label>名称</label>
                <input
                  type="text"
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  placeholder="My PostgreSQL"
                  required
                />
              </div>
              <div className="form-field">
                <label>主机</label>
                <input
                  type="text"
                  value={newSource.host}
                  onChange={(e) => setNewSource({ ...newSource, host: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>端口</label>
                <input
                  type="number"
                  value={newSource.port}
                  onChange={(e) => setNewSource({ ...newSource, port: parseInt(e.target.value) || 5432 })}
                  required
                />
              </div>
              <div className="form-field">
                <label>数据库</label>
                <input
                  type="text"
                  value={newSource.database}
                  onChange={(e) => setNewSource({ ...newSource, database: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>用户（可选）</label>
                <input
                  type="text"
                  value={newSource.user}
                  onChange={(e) => setNewSource({ ...newSource, user: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>密码（可选）</label>
                <input
                  type="password"
                  value={newSource.password}
                  onChange={(e) => setNewSource({ ...newSource, password: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddSource(false)}>取消</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? '添加中...' : '添加数据源'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Data Sources Grid */}
      <div className="datasources-grid">
        {dataSources.map((source) => (
          <div key={source.id} data-source-id={source.id} className={`datasource-card datasource-card-${source.status === 'connected' ? 'active' : 'inactive'}`}>
            {/* Card Header */}
            <div className="datasource-card-header">
              <div className="datasource-info">
                <div className="datasource-avatar">
                  {source.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="datasource-name">{source.name}</h3>
                  <span className="datasource-type">{source.type}</span>
                </div>
              </div>
              <div className={`datasource-status status-${source.status === 'connected' ? 'active' : 'inactive'}`}>
                {source.status === 'connected' ? (
                  <>
                    <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>已连接</span>
                  </>
                ) : (
                  <>
                    <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span>连接错误</span>
                  </>
                )}
              </div>
            </div>

            {/* Card Content */}
            <div className="datasource-card-content">
              <div className="datasource-metrics">
                <div className="metric">
                  <span className="metric-label">主机</span>
                  <span className="metric-value">{source.connection.host}:{source.connection.port}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">数据库</span>
                  <span className="metric-value">{source.connection.database}</span>
                </div>
              </div>

              {/* Available Collections */}
              {discoveredCollections[source.id] && discoveredCollections[source.id].length > 0 && (
                <div className="discovered-collections">
                  <h4>可用知识库 ({discoveredCollections[source.id].length})</h4>
                  {discoveredCollections[source.id].map((collection) => {
                    // 检查这个知识库关联了哪些应用
                    const linkedApps = collections.filter(
                      c => c.tableName === collection.name
                    ).map(c => c.appId)

                    return (
                      <div key={collection.name} className="collection-item-expanded">
                        <div className="collection-main-info">
                          <div className="collection-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="collection-name">{collection.name}</span>
                              {linkedApps.length > 0 && (
                                <span className="collection-linked-badge">
                                  <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            <span className="collection-meta">{collection.entryCount || 0} 条数据</span>
                          </div>
                          {linkedApps.length > 0 && (
                            <div className="linked-apps">
                              <span className="linked-apps-label">已关联:</span>
                              <span className="linked-apps-list">{linkedApps.join(', ')}</span>
                              <button
                                className="btn-edit-collection"
                                onClick={() => {
                                  const collectionConfig = collections.find(
                                    c => c.tableName === collection.name && c.appId === linkedApps[0]
                                  )
                                  const editKey = `${source.id}-${collection.name}`
                                  setEditForm(prev => ({
                                    ...prev,
                                    [editKey]: {
                                      appId: linkedApps[0],
                                      collectionName: collection.name,
                                      contentField: collectionConfig?.contentField || 'content',
                                      embeddingField: collectionConfig?.embeddingField || 'embedding',
                                      threshold: collectionConfig?.threshold || 0.7
                                    }
                                  }))
                                  setShowEditDialog(prev => ({
                                    ...prev,
                                    [editKey]: true
                                  }))
                                }}
                                title="编辑配置"
                              >
                                <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="collection-actions">
                          <button
                            className="btn-link-app"
                            onClick={async () => {
                              // 获取表结构
                              await fetchTableSchema(collection.name)

                              // 初始化临时选择的app（复制当前已关联的app）
                              const mappingKey = `${source.id}-${collection.name}`
                              const currentLinkedApps = collections.filter(
                                c => c.tableName === collection.name
                              ).map(c => c.appId)
                              setSelectedAppsForMapping(prev => ({
                                ...prev,
                                [mappingKey]: currentLinkedApps
                              }))

                              setShowCollectionAppSelector(prev => ({
                                ...prev,
                                [`${source.id}-${collection.name}`]: true
                              }))
                            }}
                            title="关联应用"
                          >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            关联应用
                          </button>
                        </div>

                        {/* App Selector Dropdown */}
                        {showCollectionAppSelector[`${source.id}-${collection.name}`] && (
                          <div
                            className="app-selector-dropdown"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="selector-header">
                              <span>关联应用到知识库</span>
                              <button
                                className="btn-close-dropdown"
                                onClick={() => setShowCollectionAppSelector(prev => ({
                                  ...prev,
                                  [`${source.id}-${collection.name}`]: false
                                }))}
                              >
                                ✕
                              </button>
                            </div>

                            {/* 字段映射配置 */}
                            <div className="field-mapping-section">
                              <div className="field-mapping-title">字段映射配置</div>
                              <div className="field-mapping-fields">
                                <SearchableSelect
                                  label="内容字段名"
                                  value={fieldMappings[`${source.id}-${collection.name}`]?.contentField || 'content'}
                                  onChange={handleContentFieldChange(source.id, collection.name)}
                                  options={tableSchemas[collection.name]?.map(col => col.name) || []}
                                  placeholder="选择或输入内容字段名"
                                />
                                <SearchableSelect
                                  label="Embedding字段名"
                                  value={fieldMappings[`${source.id}-${collection.name}`]?.embeddingField || 'embedding'}
                                  onChange={handleEmbeddingFieldChange(source.id, collection.name)}
                                  options={tableSchemas[collection.name]?.map(col => col.name) || []}
                                  placeholder="选择或输入Embedding字段名"
                                />
                                <div className="field-input">
                                  <label>相似度阈值</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={fieldMappings[`${source.id}-${collection.name}`]?.threshold || 0.7}
                                    onChange={(e) => handleThresholdChange(source.id, collection.name)(e.target.value)}
                                    placeholder="0.7"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="selector-list">
                              {availableApps.length === 0 ? (
                                <div className="no-apps-hint">暂无可用应用</div>
                              ) : (
                                availableApps.map((app) => {
                                  const mappingKey = `${source.id}-${collection.name}`
                                  const selectedApps = selectedAppsForMapping[mappingKey] || linkedApps
                                  const isLinked = selectedApps.includes(app)

                                  return (
                                    <label key={app} className="selector-item">
                                      <input
                                        type="checkbox"
                                        checked={isLinked}
                                        onChange={(e) => {
                                          const newSelectedApps = e.target.checked
                                            ? [...selectedApps, app]
                                            : selectedApps.filter(a => a !== app)
                                          setSelectedAppsForMapping(prev => ({
                                            ...prev,
                                            [mappingKey]: newSelectedApps
                                          }))
                                        }}
                                      />
                                      <span>{app}</span>
                                    </label>
                                  )
                                })
                              )}
                            </div>

                            {/* 确认和取消按钮 */}
                            <div className="mapping-actions">
                              <button
                                className="btn-cancel-mapping"
                                onClick={() => {
                                  setShowCollectionAppSelector(prev => ({
                                    ...prev,
                                    [`${source.id}-${collection.name}`]: false
                                  }))
                                  // 清空临时选择
                                  const mappingKey = `${source.id}-${collection.name}`
                                  setSelectedAppsForMapping(prev => {
                                    const newState = { ...prev }
                                    delete newState[mappingKey]
                                    return newState
                                  })
                                }}
                              >
                                取消
                              </button>
                              <button
                                className="btn-confirm-mapping"
                                onClick={async () => {
                                  const mappingKey = `${source.id}-${collection.name}`
                                  const newSelectedApps = selectedAppsForMapping[mappingKey] || []
                                  const contentField = fieldMappings[mappingKey]?.contentField || 'content'
                                  const embeddingField = fieldMappings[mappingKey]?.embeddingField || 'embedding'
                                  const threshold = fieldMappings[mappingKey]?.threshold || 0.7

                                  // 计算需要添加和删除的app
                                  const appsToAdd = newSelectedApps.filter(app => !linkedApps.includes(app))
                                  const appsToRemove = linkedApps.filter(app => !newSelectedApps.includes(app))

                                  // 执行添加和删除操作
                                  for (const app of appsToAdd) {
                                    await addCollection(collection.name, app, contentField, embeddingField, threshold)
                                  }
                                  for (const app of appsToRemove) {
                                    await removeCollection(collection.name, app)
                                  }

                                  // 关闭弹窗并清空临时选择
                                  setShowCollectionAppSelector(prev => ({
                                    ...prev,
                                    [`${source.id}-${collection.name}`]: false
                                  }))
                                  setSelectedAppsForMapping(prev => {
                                    const newState = { ...prev }
                                    delete newState[mappingKey]
                                    return newState
                                  })
                                }}
                              >
                                确认关联
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 编辑配置对话框 */}
                        {showEditDialog[`${source.id}-${collection.name}`] && (
                          <div className="collection-app-selector-overlay">
                            <div className="collection-app-selector-dialog">
                              <h4>编辑知识库配置 - {collection.name}</h4>
                              <div className="field-mapping-fields">
                                <div className="field-input">
                                  <label>内容字段</label>
                                  <input
                                    type="text"
                                    value={editForm[`${source.id}-${collection.name}`]?.contentField || 'content'}
                                    onChange={(e) => {
                                      const editKey = `${source.id}-${collection.name}`
                                      setEditForm(prev => ({
                                        ...prev,
                                        [editKey]: {
                                          ...prev[editKey],
                                          contentField: e.target.value
                                        }
                                      }))
                                    }}
                                    placeholder="content"
                                  />
                                </div>
                                <div className="field-input">
                                  <label>Embedding 字段</label>
                                  <input
                                    type="text"
                                    value={editForm[`${source.id}-${collection.name}`]?.embeddingField || 'embedding'}
                                    onChange={(e) => {
                                      const editKey = `${source.id}-${collection.name}`
                                      setEditForm(prev => ({
                                        ...prev,
                                        [editKey]: {
                                          ...prev[editKey],
                                          embeddingField: e.target.value
                                        }
                                      }))
                                    }}
                                    placeholder="embedding"
                                  />
                                </div>
                                <div className="field-input">
                                  <label>相似度阈值</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={editForm[`${source.id}-${collection.name}`]?.threshold || 0.7}
                                    onChange={(e) => {
                                      const editKey = `${source.id}-${collection.name}`
                                      setEditForm(prev => ({
                                        ...prev,
                                        [editKey]: {
                                          ...prev[editKey],
                                          threshold: parseFloat(e.target.value) || 0.7
                                        }
                                      }))
                                    }}
                                    placeholder="0.7"
                                  />
                                </div>
                              </div>

                              {/* 显示字段映射信息 */}
                              {editForm[`${source.id}-${collection.name}`] && (
                                <div className="field-mapping-info">
                                  <div className="field-mapping-label">字段映射:</div>
                                  <div className="field-mapping-values">
                                    <span>content → {editForm[`${source.id}-${collection.name}`]?.contentField || 'content'}</span>
                                    <span>embedding → {editForm[`${source.id}-${collection.name}`]?.embeddingField || 'embedding'}</span>
                                    <span>threshold → {editForm[`${source.id}-${collection.name}`]?.threshold || 0.7}</span>
                                  </div>
                                </div>
                              )}

                              <div className="mapping-actions">
                                <button
                                  className="btn-cancel-mapping"
                                  onClick={() => {
                                    setShowEditDialog(prev => ({
                                      ...prev,
                                      [`${source.id}-${collection.name}`]: false
                                    }))
                                  }}
                                >
                                  取消
                                </button>
                                <button
                                  className="btn-confirm-mapping"
                                  onClick={async () => {
                                    const editKey = `${source.id}-${collection.name}`
                                    const form = editForm[editKey]
                                    const success = await updateCollection(
                                      form.appId,
                                      form.collectionName,
                                      form.contentField,
                                      form.embeddingField,
                                      form.threshold
                                    )
                                    if (success) {
                                      setShowEditDialog(prev => ({
                                        ...prev,
                                        [editKey]: false
                                      }))
                                    }
                                  }}
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* No Collections Message */}
              {(!discoveredCollections[source.id] || discoveredCollections[source.id].length === 0) && (
                <div className="no-collections-hint">
                  <p>暂无知识库集合</p>
                </div>
              )}
            </div>

            {/* Card Footer */}
            <div className="datasource-card-footer">
              <button
                className="btn-test"
                onClick={() => testDataSource(source.id)}
                disabled={testingConnection === source.id}
              >
                {testingConnection === source.id ? '测试中...' : '测试连接'}
              </button>
              {source.id !== 'default' && (
                <button
                  className="btn-delete-datasource"
                  onClick={() => deleteDataSource(source.id, source.name)}
                  disabled={loading}
                  title="删除数据源"
                >
                  <svg style={{ width: '18px', height: '18px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Linked Collections Section */}
      {collections.length > 0 && (
        <div className="linked-collections-section">
          <div className="section-header">
            <h2 className="section-title">已关联的知识库</h2>
          </div>

          {/* App Filter */}
          <div className="app-filter">
            <button
              className={`filter-chip ${selectedAppFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedAppFilter('all')}
            >
              全部
            </button>
            {Array.from(new Set(collections.map(c => c.appId))).map(appId => (
              <button
                key={appId}
                className={`filter-chip ${selectedAppFilter === appId ? 'active' : ''}`}
                onClick={() => setSelectedAppFilter(appId)}
              >
                {appId}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="collections-list">
              {Object.entries(
                collections
                  .filter(collection => selectedAppFilter === 'all' || collection.appId === selectedAppFilter)
                  .reduce((acc, collection) => {
                    if (!acc[collection.tableName]) {
                      acc[collection.tableName] = []
                    }
                    acc[collection.tableName].push(collection)
                    return acc
                  }, {})
              ).map(([collectionName, apps]) => (
                <div key={collectionName} className="collection-card-group">
                  <div className="collection-main">
                    <div className="collection-avatar">
                      {collectionName.charAt(0).toUpperCase()}
                    </div>
                    <div className="collection-details">
                      <div className="collection-name">{collectionName}</div>
                      <div className="collection-meta">关联 {apps.length} 个应用</div>
                    </div>
                  </div>
                  {/* 字段映射信息单独一行 */}
                  {apps.length > 0 && (
                    <div className="collection-field-mapping-row">
                      <div className="collection-field-mapping">
                        <span className="field-mapping-item">
                          <span className="field-mapping-label">内容字段:</span>
                          <span className="field-mapping-value">{apps[0].contentField || 'content'}</span>
                        </span>
                        <span className="field-mapping-separator">•</span>
                        <span className="field-mapping-item">
                          <span className="field-mapping-label">embedding:</span>
                          <span className="field-mapping-value">{apps[0].embeddingField || 'embedding'}</span>
                        </span>
                        <span className="field-mapping-separator">•</span>
                        <span className="field-mapping-item">
                          <span className="field-mapping-label">阈值:</span>
                          <span className="field-mapping-value">{apps[0].threshold !== undefined ? apps[0].threshold : 0.7}</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="collection-apps-list">
                    {apps.map((app) => (
                      <div key={`${collectionName}-${app.appId}`} className="app-item">
                        <div className="app-info">
                          <div className="app-name">{app.appId}</div>
                          <button
                            className={`status-toggle ${app.enabled ? 'enabled' : 'disabled'}`}
                            onClick={() => toggleCollectionStatus(collectionName, app.enabled, app.appId)}
                          >
                            {app.enabled ? '已启用' : '已禁用'}
                          </button>
                        </div>
                        <button
                          className="btn-delete-mini"
                          onClick={() => removeCollection(collectionName, app.appId)}
                          disabled={loading}
                          title="移除关联"
                        >
                          <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
        </div>
        </div>
      )}
    </div>
  )
}

export default Knowledge
