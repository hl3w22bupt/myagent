import { useState, useEffect } from 'react'
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
  const [retryingTasks, setRetryingTasks] = useState({})
  const pageSize = 12

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
  }, [filter, sortBy, searchQuery, selectedSkill, page])

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

      // 排序
      allTasks = [...allTasks].sort((a, b) => {
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

      // 如果有搜索查询，进行过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim()
        allTasks = allTasks.filter(task =>
          task.task.toLowerCase().includes(query) ||
          task.taskId.toLowerCase().includes(query)
        )
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
      <div className="tasks-header">
        <h1>任务列表</h1>
      </div>

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
      </div>

      {/* 任务列表 */}
      <div className="tasks-content">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : tasks.length > 0 ? (
          <>
            <div className="tasks-list">
              {tasks.map(task => (
                <div key={task.taskId} className="task-card">
                  <div className="task-header">
                    <Link to={`/tasks/${task.taskId}`} className="task-title">
                      {task.task}
                    </Link>
                    <div className="task-status-actions">
                      <span className={`status status-${task.executionTime === null ? 'running' : (task.success ? 'completed' : 'failed')}`}>
                        {task.executionTime === null ? '执行中' : (task.success ? '已完成' : '失败')}
                      </span>
                      {task.executionTime !== null && !task.success && (
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
                    <div className="detail-item detail-item-with-action">
                      <span className="detail-label">执行时间:</span>
                      <span className="detail-value">{formatDuration(task.executionTime)}</span>
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
                    {task.skill && (
                      <div className="detail-item">
                        <span className="detail-label">技能:</span>
                        <span className="detail-value">{task.skill}</span>
                      </div>
                    )}
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