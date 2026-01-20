import axios from 'axios'

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

// 子代理相关 API
export const agentsAPI = {
  getAgents: () =>
    apiClient.get('/api/agents').then(response => ({
      ...response,
      data: response.data.agents || []
    }))
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
  submitTask: (task) => apiClient.post('/agent/execute', { task }),
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
