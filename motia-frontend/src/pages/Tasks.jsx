import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { tasksAPI, skillsAPI } from '../services/api'
import './Tasks.css'

function Tasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState('')
  const [availableSkills, setAvailableSkills] = useState([])
  const [skillsMap, setSkillsMap] = useState({})
  const [selectedApp, setSelectedApp] = useState('')
  const [availableApps, setAvailableApps] = useState([])
  const [retryingTasks, setRetryingTasks] = useState({})
  const [selectedTasks, setSelectedTasks] = useState(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [deletingTasks, setDeletingTasks] = useState(new Set())
  const [pinningTasks, setPinningTasks] = useState(new Set())
  const pageSize = 12

  // 使用 useRef 防止重复提交（立即生效，不受 setState 异步影响）
  const isDeletingRef = useRef(false)

  // 加载可用技能列表
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const response = await skillsAPI.getSkills()
        // 提取技能ID列表
        const skillIds = response.data.map(skill => skill.id || skill.name)
        setAvailableSkills(skillIds)

        // 创建技能ID到显示名称的映射
        const map = {}
        response.data.forEach(skill => {
          const id = skill.id || skill.name
          // 直接使用原始的 skill name
          map[id] = skill.name || id
        })
        setSkillsMap(map)
      } catch (error) {
        console.error('Error fetching skills:', error)
        // 如果API失败，使用默认列表
        const defaultSkills = [
          'code-analysis',
          'infographic-generator',
          'remotion-generator',
          'summarize',
          'web-search'
        ]
        setAvailableSkills(defaultSkills)
        setSkillsMap({
          'code-analysis': 'code-analysis',
          'infographic-generator': 'infographic-generator',
          'remotion-generator': 'remotion-generator',
          'summarize': 'summarize',
          'web-search': 'web-search'
        })
      }
    }
    fetchSkills()
  }, [])

  // 统一的数据获取逻辑
  useEffect(() => {
    fetchTasks()
  }, [filter, sortBy, searchQuery, selectedSkill, selectedApp, page])

  // 调试：监听 tasks 状态变化
  useEffect(() => {
    console.log('[Tasks] Tasks state updated:', tasks.length, 'tasks')
    const pinnedTasks = tasks.filter(t => t.pinned)
    console.log('[Tasks] Pinned tasks:', pinnedTasks.length, pinnedTasks.map(t => ({ id: t.taskId, pinned: t.pinned })))
  }, [tasks])

  const fetchTasks = async () => {
    try {
      setLoading(true)

      // 如果有搜索查询或需要排序，需要获取所有数据
      const needsAllData = searchQuery || sortBy !== 'newest'
      const params = needsAllData
        ? { limit: 1000 } // 获取更多数据用于搜索和排序
        : { limit: pageSize, offset: page * pageSize }

      if (filter !== 'all') {
        params.status = filter
      }

      // 添加 skill 参数到后端
      if (selectedSkill) {
        params.skills = selectedSkill
      }

      const apiResponse = await tasksAPI.getTasks(params)
      let allTasks = apiResponse.data || []

      // 提取所有唯一的 app 值
      const uniqueApps = [...new Set(allTasks.map(task => task.app || 'default'))].sort()
      setAvailableApps(uniqueApps)

      // 调试：检查 pinned 字段
      console.log('[Tasks] Fetched tasks:', allTasks.length, 'tasks')
      if (allTasks.length > 0) {
        console.log('[Tasks] First task pinned status:', allTasks[0].pinned, 'Task:', allTasks[0].taskId)
      }

      // 只有在需要前端排序时才排序（后端已按 pinned DESC, created_at DESC 排序）
      if (needsAllData) {
        allTasks = [...allTasks].sort((a, b) => {
          // 首先按 pinned 状态排序（置顶的在前）
          const aPinned = a.pinned ? 1 : 0
          const bPinned = b.pinned ? 1 : 0
          if (aPinned !== bPinned) {
            return bPinned - aPinned
          }

          // pinned 状态相同时，按选定条件排序
          switch (sortBy) {
            case 'newest':
              return new Date(b.timestamp) - new Date(a.timestamp)
            case 'oldest':
              return new Date(a.timestamp) - new Date(b.timestamp)
            case 'duration':
              return (b.executionTime || 0) - (a.executionTime || 0)
            default:
              return 0
          }
        })
      }

      // 如果有搜索查询，进行过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim()
        allTasks = allTasks.filter(task =>
          task.task.toLowerCase().includes(query) ||
          task.taskId.toLowerCase().includes(query)
        )
      }

      // 按 app 过滤
      if (selectedApp) {
        allTasks = allTasks.filter(task => (task.app || 'default') === selectedApp)
      }

      // 如果需要前端分页（搜索或自定义排序）
      if (needsAllData) {
        const startIndex = page * pageSize
        const endIndex = startIndex + pageSize
        const paginatedTasks = allTasks.slice(startIndex, endIndex)

        setTasks(paginatedTasks)
        setTotalCount(allTasks.length)
        setHasMore(endIndex < allTasks.length)
      } else {
        // 使用后端分页
        setTasks(allTasks)
        setTotalCount(apiResponse.total || 0)
        setHasMore(apiResponse.hasMore || false)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrevPage = () => {
    if (page > 0) {
      setPage(page - 1)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      setPage(page + 1)
    }
  }

  const handleDeleteTask = async (taskId, event) => {
    // 阻止事件冒泡,防止触发链接跳转
    event.preventDefault()
    event.stopPropagation()

    // 确认删除
    if (!window.confirm(`确定要删除任务 ${taskId} 吗?此操作不可恢复。`)) {
      return
    }

    try {
      await tasksAPI.deleteTask(taskId)
      // 删除成功后刷新列表
      fetchTasks()
    } catch (error) {
      console.error('删除任务失败:', error)
      alert('删除任务失败,请稍后重试')
    }
  }

  const handlePinTask = async (taskId, event) => {
    event.preventDefault()
    event.stopPropagation()

    setPinningTasks(prev => new Set([...prev, taskId]))
    try {
      await tasksAPI.pinTask(taskId)
      fetchTasks()
    } catch (error) {
      console.error('置顶失败:', error)
      alert('置顶失败，请稍后重试')
    } finally {
      setPinningTasks(prev => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  const handleUnpinTask = async (taskId, event) => {
    event.preventDefault()
    event.stopPropagation()

    setPinningTasks(prev => new Set([...prev, taskId]))
    try {
      await tasksAPI.unpinTask(taskId)
      fetchTasks()
    } catch (error) {
      console.error('取消置顶失败:', error)
      alert('取消置顶失败，请稍后重试')
    } finally {
      setPinningTasks(prev => {
        const newSet = new Set(prev)
        newSet.delete(taskId)
        return newSet
      })
    }
  }

  // 处理任务选择
  const handleSelectTask = (taskId, event) => {
    event.stopPropagation()
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  // 处理全选/取消全选
  const handleSelectAll = () => {
    if (selectedTasks.size === tasks.length && tasks.length > 0) {
      // 如果已全选，则取消全选
      setSelectedTasks(new Set())
    } else {
      // 全选当前页的所有任务
      setSelectedTasks(new Set(tasks.map(task => task.taskId)))
    }
  }

  // 批量删除任务
  const handleBatchDelete = async () => {
    // 使用 useRef 防止重复提交（立即生效，不受 setState 异步影响）
    if (isDeletingRef.current) {
      console.warn('删除操作进行中，请勿重复点击')
      return
    }

    if (selectedTasks.size === 0) {
      alert('请先选择要删除的任务')
      return
    }

    const count = selectedTasks.size
    if (!window.confirm(`确定要删除选中的 ${count} 个任务吗?此操作不可恢复。`)) {
      return
    }

    try {
      // 立即标记删除中（防止重复点击）
      isDeletingRef.current = true
      setDeletingTasks(new Set(selectedTasks))

      // 使用批量删除API（一次请求删除所有任务）
      const response = await tasksAPI.deleteTasks(Array.from(selectedTasks))

      // 处理响应
      const { summary, results } = response.data

      if (summary.successfulCount > 0) {
        // 至少有一些任务删除成功
        let message = `成功删除 ${summary.successfulCount} 个任务`

        if (summary.failedCount > 0) {
          message += `，失败 ${summary.failedCount} 个`

          // 显示失败的详情
          console.error('部分任务删除失败:', results.failed)

          // 可选：显示更详细的错误信息
          if (results.failed && results.failed.length > 0) {
            const failedList = results.failed.map(f => `- ${f.taskId}: ${f.error}`).join('\n')
            console.error('失败任务列表:\n' + failedList)
          }
        }

        // 删除成功后清空选择并刷新列表
        setSelectedTasks(new Set())
        setIsSelectMode(false)
        fetchTasks()

        alert(message)
      } else {
        // 所有任务都删除失败
        throw new Error('批量删除失败')
      }
    } catch (error) {
      console.error('批量删除任务失败:', error)
      const errorMessage = error.response?.data?.message || error.message || '批量删除任务失败，请稍后重试'
      alert(errorMessage)
    } finally {
      // 清除删除中状态
      isDeletingRef.current = false
      setDeletingTasks(new Set())
    }
  }

  // 切换选择模式
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode)
    setSelectedTasks(new Set())
  }

  // 判断任务是否被选中
  const isTaskSelected = (taskId) => {
    return selectedTasks.has(taskId)
  }

  // 判断是否全选
  const isAllSelected = () => {
    return tasks.length > 0 && selectedTasks.size === tasks.length
  }

  // 判断是否部分选中
  const isSomeSelected = () => {
    return selectedTasks.size > 0 && selectedTasks.size < tasks.length
  }

  const handleRetryTask = async (taskId, event) => {
    // 阻止事件冒泡,防止触发链接跳转
    event.preventDefault()
    event.stopPropagation()

    if (retryingTasks[taskId]) return

    if (!window.confirm(`确定要重试任务 ${taskId} 吗?`)) {
      return
    }

    setRetryingTasks(prev => ({ ...prev, [taskId]: true }))
    try {
      await tasksAPI.retryTask(taskId)
      alert('任务重试已启动')
      // 刷新列表
      fetchTasks()
    } catch (error) {
      console.error('重试失败:', error)
      const errorMessage = error.response?.data?.message || '重试失败，请稍后重试'
      alert(errorMessage)
    } finally {
      setRetryingTasks(prev => ({ ...prev, [taskId]: false }))
    }
  }


  const getSkillDisplayName = (skill) => {
    // 使用动态从API获取的技能映射
    return skillsMap[skill] || skill
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const formatDuration = (milliseconds) => {
    if (!milliseconds) return '-'
    // 将毫秒转换为秒
    const totalSeconds = Math.floor(milliseconds / 1000)

    if (totalSeconds < 60) return `${totalSeconds}秒`
    if (totalSeconds < 3600) {
      const mins = Math.floor(totalSeconds / 60)
      const secs = totalSeconds % 60
      return `${mins}分${secs}秒`
    }
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return `${hours}小时${mins}分${secs}秒`
  }

  const statusOptions = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待执行' },
    { value: 'running', label: '执行中' },
    { value: 'idle', label: '空闲' },
    { value: 'completed', label: '已完成' },
    { value: 'failed', label: '失败' }
  ]

  const sortOptions = [
    { value: 'newest', label: '最新' },
    { value: 'oldest', label: '最旧' },
    { value: 'duration', label: '执行时间' }
  ]

  return (
    <div className="tasks">
      {/* 筛选和排序 */}
      <div className="filter-bar">
        <div className="filter-group filter-search">
          <label>搜索:</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索任务名称或ID..."
            className="search-input"
          />
        </div>

        {/* Skill 单选过滤器 */}
        <div className="filter-group">
          <label>技能:</label>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="filter-select"
          >
            <option value="">全部</option>
            {availableSkills.map(skill => (
              <option key={skill} value={skill}>
                {getSkillDisplayName(skill)}
              </option>
            ))}
          </select>
        </div>

        {/* App 过滤器 */}
        <div className="filter-group">
          <label>应用:</label>
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="filter-select"
          >
            <option value="">全部</option>
            {availableApps.map(app => (
              <option key={app} value={app}>{app}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>状态:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>排序:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 选择模式和批量删除按钮 */}
        <div className="filter-group filter-actions">
          <button
            className={`select-mode-button ${isSelectMode ? 'active' : ''}`}
            onClick={toggleSelectMode}
            title={isSelectMode ? '退出选择模式' : '进入选择模式'}
          >
            {isSelectMode ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                退出选择
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                多选
              </>
            )}
          </button>

          {isSelectMode && (
            <>
              <button
                className="select-all-button"
                onClick={handleSelectAll}
                title={isAllSelected() ? '取消全选' : '全选'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {isAllSelected() ? (
                    <>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                    </>
                  ) : isSomeSelected() ? (
                    <>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <polyline points="9 11 12 14 22 4"></polyline>
                    </>
                  ) : (
                    <>
                      <polyline points="9 11 12 14 22 4"></polyline>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </>
                  )}
                </svg>
                {isAllSelected() ? '取消全选' : '全选'}
              </button>

              {selectedTasks.size > 0 && (
                <button
                  className="batch-delete-button"
                  onClick={handleBatchDelete}
                  disabled={deletingTasks.size > 0 || isDeletingRef.current}
                  title={`删除选中的 ${selectedTasks.size} 个任务`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  删除 ({selectedTasks.size})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 任务列表 */}
      <div className="tasks-content">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : tasks.length > 0 ? (
          <>
            <div className="tasks-list">
              {tasks.map(task => (
                <div
                  key={task.taskId}
                  className={`task-card ${isTaskSelected(task.taskId) ? 'selected' : ''} ${isSelectMode ? 'select-mode' : ''}`}
                >
                  {isSelectMode && (
                    <div className="task-checkbox" onClick={(e) => handleSelectTask(task.taskId, e)}>
                      <div className={`checkbox ${isTaskSelected(task.taskId) ? 'checked' : ''}`}>
                        {isTaskSelected(task.taskId) && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="task-header">
                    <Link to={`/tasks/${task.taskId}`} className="task-title">
                      {task.task}
                    </Link>
                    <div className="task-status-actions">
                      <span className={`status status-${task.status || 'pending'}`}>
                        {task.status === 'running' ? '执行中' : task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : task.status === 'pending' ? '待执行' : task.status === 'idle' ? '空闲' : task.status === 'resolved' ? '已解决' : task.status === 'awaiting_clarification' ? '等待澄清' : task.status === 'started' ? '已开始' : task.status || '待执行'}
                      </span>
                      {task.status === 'failed' && (
                        <button
                          className="retry-button-small"
                          onClick={(e) => handleRetryTask(task.taskId, e)}
                          disabled={retryingTasks[task.taskId]}
                          title="重新执行此任务"
                          aria-label="重新执行此任务"
                        >
                          {retryingTasks[task.taskId] ? (
                            <svg className="retry-icon spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                            </svg>
                          ) : (
                            <svg className="retry-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 4 23 10 17 10"></polyline>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="task-details">
                    <div className="detail-item">
                      <span className="detail-label">任务 ID:</span>
                      <span className="detail-value detail-task-id">{task.taskId}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">创建时间:</span>
                      <span className="detail-value">{formatDate(task.timestamp)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">执行时间:</span>
                      <span className="detail-value">{formatDuration(task.executionTime)}</span>
                    </div>
                    {task.skill && (
                      <div className="detail-item">
                        <span className="detail-label">技能:</span>
                        <span className="detail-value">{task.skill}</span>
                      </div>
                    )}
                    {/* 显示产物数 */}
                    <div className="detail-item">
                      <span className="detail-label">产物:</span>
                      <span className="detail-value">
                        {task.artifactsCount || 0} 个
                      </span>
                    </div>
                  </div>
                  {/* 底层：应用名（左）+ 按钮组（右） */}
                  <div className="task-footer">
                    <div className="task-footer-app">
                      {/* <span className="detail-label">应用:</span> */}
                      <span className="detail-value detail-app-badge">
                        <svg className="detail-app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                          <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                        {task.app || 'default'}
                      </span>
                    </div>
                    <div className="action-buttons-group">
                      {task.pinned ? (
                        <button
                          className="unpin-button"
                          onClick={(e) => handleUnpinTask(task.taskId, e)}
                          title="取消置顶"
                          disabled={pinningTasks.has(task.taskId)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="17" x2="12" y2="22"></line>
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-2.11 1.55l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                          </svg>
                        </button>
                      ) : (
                        <button
                          className="pin-button"
                          onClick={(e) => handlePinTask(task.taskId, e)}
                          title="置顶"
                          disabled={pinningTasks.has(task.taskId)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="17" x2="12" y2="22"></line>
                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-2.11 1.55l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                          </svg>
                        </button>
                      )}
                      <button
                        className="delete-button"
                        onClick={(e) => handleDeleteTask(task.taskId, e)}
                        title="删除任务"
                        aria-label="删除任务"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 分页控件 */}
            {totalCount > 0 && (
              <div className="pagination">
                <div className="pagination-info">
                  显示 {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} 条，共 {totalCount} 条
                </div>
                <div className="pagination-controls">
                  <button
                    className="pagination-button"
                    onClick={handlePrevPage}
                    disabled={page === 0 || loading}
                  >
                    上一页
                  </button>
                  <span className="pagination-current">
                    第 {page + 1} 页
                  </span>
                  <button
                    className="pagination-button"
                    onClick={handleNextPage}
                    disabled={!hasMore || loading}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="no-tasks">
            暂无任务
          </div>
        )}
      </div>
    </div>
  )
}

export default Tasks