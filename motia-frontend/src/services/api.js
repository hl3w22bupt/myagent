import axios from 'axios'

console.log('import.meta.env:', import.meta.env)
console.log('VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL)

// 使用相对路径以便通过 Vite 代理，或者使用环境变量中的完整 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': import.meta.env.VITE_API_KEY || ''
  },
  timeout: 30000, // 增加到 30 秒超时
  maxRedirects: 5,
  // 开发环境下避免 CORS 问题
  withCredentials: false
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('Request Error:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url)
    return response
  },
  (error) => {
    console.error('Response Error:', error)
    return Promise.reject(error)
  }
)

// 系统信息相关 API
export const systemAPI = {
  getSystemInfo: () =>
    apiClient.get('/api/system').then(response => ({
      ...response,
      data: {
        totalTasks: response.data.stats?.totalTasks || 0,
        completedTasks: response.data.stats?.successfulTasks || 0
      }
    }))
}

// 技能相关 API
export const skillsAPI = {
  getSkills: () =>
    apiClient.get('/api/skills').then(response => ({
      ...response,
      data: response.data.skills || [],
      nativeCount: response.data.nativeCount || 0,
      claudeCount: response.data.claudeCount || 0,
      openclawCount: response.data.openclawCount || 0,
      count: response.data.count || 0
    })),
  getSkillDetails: (id) => apiClient.get(`/api/skills/${id}`)
}

// 防重复请求存储
const pendingRequests = new Set()

// 生成请求唯一标识符
const generateRequestKey = (taskId, message) => {
  return `${taskId}_${message}`
}

// 子代理相关 API
export const agentsAPI = {
  getAgents: () =>
    apiClient.get('/api/agents').then(response => ({
      ...response,
      data: response.data.agents || []
    })),
  sendChatMessage: (taskId, message, sessionId) => {
    const requestKey = generateRequestKey(taskId, message)

    // 检查是否有相同的请求正在处理中
    if (pendingRequests.has(requestKey)) {
      console.warn('重复请求被阻止:', requestKey)
      return Promise.reject(new Error('请求正在处理中'))
    }

    // 添加到待处理请求集合
    pendingRequests.add(requestKey)

    return apiClient.post(`/api/tasks/${taskId}/chat`, { message, sessionId })
      .finally(() => {
        // 请求完成后移除
        pendingRequests.delete(requestKey)
      })
  }
}

// 任务相关 API
export const tasksAPI = {
  getTasks: (params = {}) =>
    apiClient.get('/agent/results', { params }).then(response => ({
      ...response,
      data: response.data.results || [],
      total: response.data.total || 0,
      hasMore: response.data.hasMore || false
    })),
  getTaskDetails: (id, timeout = 30000) =>
    apiClient.get('/agent/result', {
      params: { id },
      timeout // 支持自定义超时时间
    }).then(response => response.data.result),
  submitTask: (task, sessionId, delegateTo) => {
    const requestKey = `submit_${task}_${sessionId}`

    // 检查是否有相同的请求正在处理中
    if (pendingRequests.has(requestKey)) {
      console.warn('重复的 submitTask 请求被阻止:', requestKey)
      return Promise.reject(new Error('任务正在提交中，请稍候'))
    }

    // 添加到待处理请求集合
    pendingRequests.add(requestKey)

    const payload = { task, sessionId }
    if (delegateTo && delegateTo.length > 0) {
      payload.delegateTo = delegateTo
    }

    return apiClient.post('/agent/execute', payload)
      .finally(() => {
        // 请求完成后移除
        pendingRequests.delete(requestKey)
      })
  },
  deleteTask: (id) => {
    console.log('=== deleteTask 被调用 ===')
    console.log('删除任务 ID:', id)
    // 使用统一的删除API，通过id参数删除单个任务
    return apiClient.delete('/agent/results', {
      params: { id },
      timeout: 30000
    }).then(response => response.data)
      .catch(error => {
      console.error('=== deleteTask API 错误 ===')
      console.error('错误对象:', error)
      console.error('错误 code:', error.code)
      console.error('是否超时:', error.code === 'ECONNABORTED')
      throw error
    })
  },
  deleteTasks: (ids) => {
    console.log('=== deleteTasks 被调用（批量删除）===')
    console.log('删除任务 IDs:', ids)
    // 使用统一的删除API，通过ids参数删除多个任务
    return apiClient.delete('/agent/results', {
      params: { ids: Array.isArray(ids) ? ids.join(',') : ids },
      timeout: 60000 // 批量操作增加到 60 秒
    }).then(response => ({
      ...response,
      data: {
        success: response.data.success,
        message: response.data.message,
        type: response.data.type,
        summary: response.data.summary || {
          totalRequested: Array.isArray(ids) ? ids.length : 1,
          successfulCount: response.data.results?.successful?.length || 0,
          failedCount: response.data.results?.failed?.length || 0
        },
        results: response.data.results || {
          successful: [],
          failed: []
        }
      }
    })).catch(error => {
      console.error('=== deleteTasks API 错误 ===')
      console.error('错误对象:', error)
      console.error('错误 code:', error.code)
      console.error('是否超时:', error.code === 'ECONNABORTED')
      throw error
    })
  },
  retryTask: (id) =>
    apiClient.post('/agent/result/retry', {}, { params: { id } }),
  pinTask: (taskId) =>
    apiClient.post('/api/tasks/pin', { taskId })
      .then(response => response.data),
  unpinTask: (taskId) =>
    apiClient.post('/api/tasks/unpin', { taskId })
      .then(response => response.data),
  getPinnedTasks: () =>
    apiClient.get('/api/tasks/pinned')
      .then(response => response.data),
}

// 精选相关 API
export const favoritesAPI = {
  // 添加到精选
  addFavorite: (artifactId, taskId) =>
    apiClient.post('/api/favorites/add', {
      artifactId,
      taskId
    }).then(response => response.data),

  // 从精选移除
  removeFavorite: (favoriteId) =>
    apiClient.post('/api/favorites/remove', {
      favoriteId
    }).then(response => response.data),

  // 获取精选列表
  getFavorites: (params = {}) =>
    apiClient.get('/api/favorites', { params }).then(response => response.data),

  // 检查是否已收藏
  isFavorite: async (artifactId) => {
    try {
      const response = await apiClient.get('/api/favorites', {
        params: { artifactId }
      })
      return response.data.isFavorite || false
    } catch (error) {
      console.error('检查收藏状态失败:', error)
      return false
    }
  }
}

// Token Usage APIs
export const tokenUsageAPI = {
  // Get task token usage
  getTaskTokenUsage: (taskId) => {
    return apiClient.get(`/api/tasks/${taskId}/token-usage`)
  },

  // Get global summary
  getSummary: (timeRange = '24h') => {
    return apiClient.get('/api/token-usage/summary', {
      params: { timeRange }
    })
  },

  // Get trends
  getTrends: (timeRange = '7d') => {
    return apiClient.get('/api/token-usage/trends', {
      params: { timeRange }
    })
  }
}

// Soul Agents 相关 API
export const soulAgentsAPI = {
  // 获取所有自主智能体状态
  getStatus: () =>
    apiClient.get('/api/soul-agents/status').then(response => response.data),

  // 获取 Soul 完整配置
  getConfig: (soulId) =>
    apiClient.get(`/api/soul/${soulId}/config`).then(response => response.data),

  // 获取 Soul 执行历史
  getExecutionHistory: (soulId, params = {}) =>
    apiClient.get(`/api/soul/${soulId}/execution-history`, { params }).then(response => response.data),

  // 调用 Soul Agent
  executeSoul: (soulId, userId, context) =>
    apiClient.post(`/api/soul/${soulId}/execute`, {
      userId,
      trigger_time: new Date().toISOString(),
      context
    }).then(response => response.data),

  // Soul 聊天接口
  chat: (soulId, userId, message) =>
    apiClient.post('/api/demo/soul/chat', {
      soulId,
      userId,
      message
    }).then(response => response.data),

  // 休眠 Soul
  hibernate: (soulId, userId, reason) =>
    apiClient.post(`/api/soul/${soulId}/hibernate/${userId}`, {
      reason: reason || 'Manual hibernation'
    }).then(response => response.data)
}

export default apiClient
