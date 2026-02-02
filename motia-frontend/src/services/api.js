import axios from 'axios'

console.log('import.meta.env:', import.meta.env)
console.log('VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': import.meta.env.VITE_API_KEY || ''
  },
  timeout: 10000, // 10秒超时
  maxRedirects: 5
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
      data: response.data.skills || []
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
  getTaskDetails: (id) =>
    apiClient.get('/agent/result', { params: { id } }).then(response => response.data.result),
  submitTask: (task, sessionId) => {
    const requestKey = `submit_${task}_${sessionId}`

    // 检查是否有相同的请求正在处理中
    if (pendingRequests.has(requestKey)) {
      console.warn('重复的 submitTask 请求被阻止:', requestKey)
      return Promise.reject(new Error('任务正在提交中，请稍候'))
    }

    // 添加到待处理请求集合
    pendingRequests.add(requestKey)

    return apiClient.post('/agent/execute', { task, sessionId })
      .finally(() => {
        // 请求完成后移除
        pendingRequests.delete(requestKey)
      })
  },
  deleteTask: (id) => {
    console.log('=== deleteTask 被调用 ===')
    console.log('删除任务 ID:', id)
    return apiClient.delete('/agent/result', {
      params: { id },
      timeout: 30000 // 增加到 30 秒
    }).catch(error => {
      console.error('=== deleteTask API 错误 ===')
      console.error('错误对象:', error)
      console.error('错误 code:', error.code)
      console.error('是否超时:', error.code === 'ECONNABORTED')
      throw error
    })
  },
  retryTask: (id) =>
    apiClient.post('/agent/result/retry', {}, { params: { id } })
}

export default apiClient
