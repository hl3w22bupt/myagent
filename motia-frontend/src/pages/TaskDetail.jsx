import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { tasksAPI, agentsAPI, favoritesAPI } from '../services/api'
import { useStreamGroup, useMotiaStream } from '@motiadev/stream-client-react'
import CodePlayer from '../components/CodePlayer'
import AudioPlayer from '../components/AudioPlayer'
import HtmlRenderer from '../components/HtmlRenderer'

// 使用与 API 配置相同的基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

import './TaskDetail.css'

/**
 * 格式化 Agent Hook 事件为人类可读的消息
 * 根据后端发送的结构化数据生成用户友好的消息
 */
const formatAgentHookMessage = (event) => {
  const { type, stage, data, taskId } = event

  console.log('[formatAgentHookMessage] 收到事件:', {
    type,
    stage,
    data,
    taskId,
    fullEvent: event
  })

  switch (type) {
    case 'agent':
      if (stage === 'pre') {
        // Agent pre hook - 直接显示任务内容（作为用户消息）
        const taskContent = data?.task || ''
        return `[🤖 agent启动]：${taskContent}`
      } else if (stage === 'post') {
        // Agent post hook - 任务完成
        const success = data?.success ? '✅ 成功' : '❌ 失败'
        return `[🤖 agent完成]：${success}`
      }
      break

    case 'intent_analysis':
      const intent = data?.intent || 'general'
      const intentNames = {
        'video_generation': '视频生成',
        'code_generation': '代码生成',
        'review': '代码审查',
        'design': '设计',
        'frontend_design': '前端设计',
        'text_generation': '文本生成',
        'general': '通用任务'
      }
      const intentName = intentNames[intent] || intent
      return `[🧠 意图识别]：${intentName} - ${data?.reasoning || ''}`

    case 'ptc_planning':
      const skills = data?.selectedSkills || []
      if (skills.length === 0) {
        return '[📋 执行计划]：直接执行任务'
      } else if (skills.length === 1) {
        return `[📋 执行计划]：使用 ${skills[0]} skill`
      } else {
        const skillsList = skills.join('、')
        return `[📋 执行计划]：依次使用 ${skillsList} skills`
      }

    default:
      console.warn('[formatAgentHookMessage] 未知事件类型:', type)
      return `[ℹ️ 系统]: ${type || '未知事件'}`
  }
}

/**
 * 获取状态配置（通用函数，用于 MessageBubble 和 StreamEntries）
 * 返回状态的标签、颜色、背景色和图标
 */
const getStatusConfig = (status) => {
  const statusLower = status?.toLowerCase() || 'pending'
  switch (statusLower) {
    case 'pending':
      return {
        label: '等待中',
        color: '#F59E0B',
        bgColor: '#FEF3C7',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        )
      }
    case 'started':
      return {
        label: '已启动',
        color: '#64748B',
        bgColor: '#F1F5F9',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        )
      }
    case 'analyzing':
      return {
        label: '分析中',
        color: '#8B5CF6',
        bgColor: '#EDE9FE',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="status-icon spinning">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        )
      }
    case 'analyzed':
      return {
        label: '已分析',
        color: '#A78BFA',
        bgColor: '#DDD6FE',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-6-6l2-2"/>
          </svg>
        )
      }
    case 'planning':
      return {
        label: '规划中',
        color: '#EC4899',
        bgColor: '#FCE7F3',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="status-icon spinning">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        )
      }
    case 'planned':
      return {
        label: '已规划',
        color: '#F472B6',
        bgColor: '#FBCFE8',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-6-6l2-2"/>
          </svg>
        )
      }
    case 'running':
      return {
        label: '执行中',
        color: '#3B82F6',
        bgColor: '#DBEAFE',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="status-icon spinning">
            <path d="M12 2v4m0 4v4m0 4h4m-4 0h4"/>
          </svg>
        )
      }
    case 'completed':
      return {
        label: '已完成',
        color: '#22C55E',
        bgColor: '#D1FAE5',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-6-6l2-2"/>
          </svg>
        )
      }
    case 'failed':
      return {
        label: '失败',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4m0 4h.01"/>
          </svg>
        )
      }
    default:
      return null
  }
}

/**
 * 格式化 Skill Hook 事件为人类可读的消息
 */
const formatSkillMessage = (message) => {
  const { type, stage, skill, data, metadata, task: messageTask, message: messageMessage } = message

  // 如果是 skill 的 post_exec 事件（stage === 'post'）
  if (type === 'skill' && stage === 'post') {
    const skillName = data?.skill_name || skill || 'skill'
    const success = data?.success !== false // 默认成功

    if (success) {
      return `[🔬 skill执行完成]: ${skillName}`
    } else {
      const errorMsg = data?.error || ''
      return errorMsg ? `❌ ${skillName} skill 执行失败：${errorMsg}` : `❌ ${skillName} skill 执行失败`
    }
  }

  // 如果是 skill 的 pre_exec 事件（stage === 'pre'）
  if (type === 'skill' && stage === 'pre') {
    const skillName = skill || 'skill'
    return `[🔬 skill开始执行]: ${skillName}`
  }

  // 默认返回简化的消息，过滤掉完整输出
  // 如果 message 或 task 字段包含大量内容（如对话历史），只显示简短描述
  const fallbackMessage = messageMessage || messageTask || ''

  if (fallbackMessage.length > 200) {
    // 消息太长，可能是完整输出，只显示简短描述
    return `[🔬 skill 执行中]: ${skill || 'skill'}`
  }

  return fallbackMessage || message.message || message.task || ''
}

function TaskDetail() {
  const { id } = useParams()
  const [task, setTask] = useState(null)
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true) // 首次加载状态
  const hasInitialData = useRef(false) // 追踪是否已成功获取过首次数据
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('visual') // 'visual' or 'text' or 'stream'
  const [mediaUrls, setMediaUrls] = useState({}) // Cache for blob URLs
  const [messages, setMessages] = useState([]) // 所有消息（包括进度和聊天）
  const [inputValue, setInputValue] = useState('') // 聊天输入框内容
  const [retrying, setRetrying] = useState(false) // 重试状态
  const [errors, setErrors] = useState([]) // 错误消息列表
  const [isSending, setIsSending] = useState(false) // 发送状态
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(null) // 当前选择的视频轮次
  const [selectedImageIndex, setSelectedImageIndex] = useState(null) // 当前选择的图片轮次
  const [selectedCodeIndex, setSelectedCodeIndex] = useState(null) // 当前选择的代码轮次
  const [streamVersion, setStreamVersion] = useState(0) // 用于追踪 stream 变化的版本号
  const [favoriteArtifacts, setFavoriteArtifacts] = useState(new Set()) // 已收藏的 artifacts
  const [loadingFavorites, setLoadingFavorites] = useState(false) // 收藏操作加载状态

  // 表格状态管理
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [tableSortColumn, setTableSortColumn] = useState(null)
  const [tableSortDirection, setTableSortDirection] = useState('asc')
  const [tableCurrentPage, setTableCurrentPage] = useState(1)

  // 获取 stream 实例
  const { stream } = useMotiaStream()

  // 渲染追踪日志
  if (process.env.NODE_ENV === 'development') {
    console.log('[🔄 TaskDetail 组件渲染]', {
      inputValueLength: inputValue.length,
      hasStream: !!stream
    })
  }

  const pollIntervalRef = useRef(null) // 使用 ref 来管理 interval

  // 使用 Motia Stream SDK 获取实时数据（WebSocket 连接，无需轮询）
  // 只在 stream 存在时订阅，避免初始化时的错误警告
  const subscriptionRef = useRef(null)
  const isSubscribedRef = useRef(false) // 追踪是否已订阅，避免重复订阅
  const streamRef = useRef(null) // 保存上一个 stream 对象引用

  // 在渲染时检测 stream 对象引用变化（每次渲染都会执行）
  const streamChanged = streamRef.current !== stream
  if (streamChanged) {
    console.log('[🔴 Stream 对象引用变化]', {
      hadStream: !!streamRef.current,
      hasStream: !!stream,
      changed: streamChanged
    })

    // 如果之前订阅过且 stream 改变了，重置订阅状态并更新版本号
    if (isSubscribedRef.current) {
      console.log('[🔴 Stream 改变，重置订阅并触发重新渲染]')
      isSubscribedRef.current = false
      setStreamVersion(v => v + 1) // 触发重新渲染，让 useEffect 重新执行
    } else if (!streamRef.current && stream) {
      // 如果之前没有 stream（不可用），现在 stream 变为可用了
      console.log('[🔴 Stream 从不可用变为可用，触发重新订阅]')
      setStreamVersion(v => v + 1) // 触发重新渲染，让 useEffect 重新执行
    }

    // 更新 streamRef
    streamRef.current = stream
  } else {
    // Stream 对象没变
    // console.log('[✅ Stream 对象引用稳定，不会触发重新订阅]')
  }
  const messagesRef = useRef([]) // 用 ref 保存消息列表，避免重新渲染时重新计算

  // 获取Stream历史数据的函数
  const fetchStreamHistory = async (taskId) => {
    try {
      console.log('[Stream History] 正在获取Stream历史数据:', taskId)

      // 获取 taskExecution stream 历史数据（包含所有类型的 hook：task、skill、agent）
      const response = await fetch('http://localhost:3000/api/tasks/' + taskId + '/stream-history')
      const result = await response.json()
      console.log('[Stream History] API响应:', result)

      if (result.success && result.data) {
        const historyEntries = Array.isArray(result.data) ? result.data : []
        console.log('[Stream History] 历史数据数量:', historyEntries.length)

        // 处理所有类型的事件
        const processedEntries = historyEntries.map(entry => {
          // 如果是 agent hook 事件（通过 category 字段标识）
          if (entry.category === 'agent_hook' || entry.id?.startsWith('agent-')) {
            return {
              id: entry.id,
              type: 'agent_hook',
              status: entry.status,  // 保留状态字段
              message: formatAgentHookMessage(entry),
              timestamp: entry.timestamp,
              originalEvent: entry,
            }
          }
          // 其他类型的事件保持原样
          return entry
        })

        // 处理历史数据（去重）
        const uniqueEntries = []
        const seenIds = new Set()
        for (const entry of processedEntries) {
          const entryId = entry.id || `${entry.timestamp}-${entry.task || entry.message || entry.type}`
          if (!seenIds.has(entryId)) {
            seenIds.add(entryId)
            uniqueEntries.push(entry)
          }
        }

        // 始终在最前面添加 task.task 作为初始用户消息（作为任务的起点）
        if (task && task.task) {
          const initialUserMessage = {
            id: `initial-task-${taskId}`,
            type: 'chat',
            progressType: 'chat',
            role: 'user',
            content: task.task,
            timestamp: task.timestamp || new Date().toISOString(),
            metadata: {
              data: {
                sender: 'user',
                message: task.task
              }
            }
          }

          // 检查是否已经存在相同的初始任务消息
          const hasInitialTask = uniqueEntries.some(
            entry => entry.id === `initial-task-${taskId}`
          )

          // 始终将初始任务消息放在最前面（覆盖之前的）
          if (hasInitialTask) {
            // 移除旧的初始任务消息
            const index = uniqueEntries.findIndex(entry => entry.id === `initial-task-${taskId}`)
            if (index !== -1) {
              uniqueEntries.splice(index, 1)
            }
          }

          // 插入到开头
          uniqueEntries.unshift(initialUserMessage)
          console.log('[Stream History] 添加/更新初始任务作为第一条消息:', task.task)
        }

        console.log('[Stream History] 去重后历史数据数量:', uniqueEntries.length)
        messagesRef.current = uniqueEntries
        setMessages(prev => [...uniqueEntries])
      }
    } catch (error) {
      console.error('[Stream History] 获取历史数据失败:', error)
    }
  }

  // 当 id 变化时，重置订阅状态和清空消息
  useEffect(() => {
    console.log('[TaskDetail] id 变化，重置订阅状态并清空消息:', id)
    isSubscribedRef.current = false
    setMessages([])
    messagesRef.current = []
  }, [id])

  // 监听 stream 可用性并订阅
  useEffect(() => {
    console.log('[🟡 useEffect 执行]', { id, streamVersion, hasStream: !!stream })

    // 如果 id 不存在，直接返回
    if (!id) {
      return
    }

    // 如果已经订阅过，直接返回（避免重复订阅）
    if (isSubscribedRef.current) {
      console.log('[✅ 已订阅，跳过重复订阅]')
      return
    }

    // 如果 stream 不可用，设置定时器定期检查
    if (!stream) {
      console.log('[⏳ Stream 不可用，等待 stream 变为可用...')

      // 设置一个定时器，每 100ms 检查一次 stream 是否可用
      const checkInterval = setInterval(() => {
        // 当 stream 变为可用时，useEffect 会因为组件重新渲染而重新执行
        // 这里我们什么都不做，只是等待组件重新渲染
      }, 100)

      // 清理定时器
      return () => clearInterval(checkInterval)
    }

    // stream 可用，进行订阅
    console.log('[🟢 Stream 可用，开始订阅...', { stream: 'taskExecution', groupId: id })

    // 用于保存所有订阅，便于统一清理
    const subscriptions = []

    try {
      // 订阅 taskExecution stream（统一处理所有事件：task、skill、agent）
      subscriptionRef.current = stream.subscribeGroup('taskExecution', id)
      subscriptions.push(subscriptionRef.current)
      console.log('[✅ taskExecution 订阅成功]', subscriptionRef.current)
    } catch (error) {
      console.error('[❌ taskExecution 订阅失败]', error)
      return
    }

    // 标记已订阅
    isSubscribedRef.current = true

    // 订阅成功后，立即获取历史数据
    fetchStreamHistory(id)

    // 监听 taskExecution 数据变化（统一处理所有类型的事件）
    subscriptionRef.current.addChangeListener((data) => {
      console.log('[Stream] 收到数据更新，类型:', typeof data)
      console.log('[Stream] 数据:', data)

      // 处理实时消息
      const entries = Array.isArray(data) ? data : []
      console.log('[Stream] entries数量:', entries.length)

      // 统一处理所有类型的事件（task hook、skill hook、agent hook）
      const processedEntries = entries.map(entry => {
        // 如果是 agent hook 事件（通过 category 字段标识）
        if (entry.category === 'agent_hook' || entry.id?.startsWith('agent-')) {
          const isAgentPre = entry.type === 'agent' && entry.stage === 'pre'

          return {
            id: entry.id,
            type: 'agent_hook',
            status: entry.status,  // 保留状态字段
            message: formatAgentHookMessage(entry),
            timestamp: entry.timestamp,
            originalEvent: entry,
            // agent pre hook 事件显示为用户消息（右边）
            metadata: isAgentPre ? {
              data: {
                sender: 'user'  // 标记为用户消息
              }
            } : undefined
          }
        }
        // 其他类型的事件保持原样
        return entry
      })

      console.log('[Stream] 处理后entries:', processedEntries)

      // 更新所有消息（去重）
      const uniqueEntries = []
      const seenIds = new Set()
      for (const entry of processedEntries) {
        const entryId = entry.id || `${entry.timestamp}-${entry.task || entry.message}`
        if (!seenIds.has(entryId)) {
          seenIds.add(entryId)
          uniqueEntries.push(entry)
        }
      }
      console.log('[Stream] 去重后entries数量:', uniqueEntries.length)
      messagesRef.current = uniqueEntries

      // 始终在最前面添加初始任务消息（确保不会被 stream 覆盖）
      if (task && task.task) {
        const initialUserMessage = {
          id: `initial-task-${id}`,
          type: 'chat',
          progressType: 'chat',
          role: 'user',
          content: task.task,
          timestamp: task.timestamp || new Date().toISOString(),
          metadata: {
            data: {
              sender: 'user',
              message: task.task
            }
          }
        }

        // 检查是否已经存在
        const hasInitialTask = uniqueEntries.some(
          entry => entry.id === `initial-task-${id}`
        )

        if (hasInitialTask) {
          // 移除旧的
          const index = uniqueEntries.findIndex(entry => entry.id === `initial-task-${id}`)
          if (index !== -1) {
            uniqueEntries.splice(index, 1)
          }
        }

        // 插入到开头
        uniqueEntries.unshift(initialUserMessage)
        console.log('[Stream] 确保初始任务消息在第一位:', task.task)
      }

      setMessages(prev => [...uniqueEntries]) // 浅拷贝确保组件更新
    })

    // 清理所有订阅
    return () => {
      subscriptions.forEach(sub => sub?.close())
      subscriptionRef.current = null
      isSubscribedRef.current = false // 重置订阅标志
    }
  }, [id, streamVersion]) // 依赖 id 和 streamVersion，当 stream 改变时会重新订阅

  // 监听 Stream 数据，当检测到任务完成时，重新获取任务详情
  useEffect(() => {
    if (!messages || messages.length === 0) {
      return
    }

    // 查找最后一个 entry
    const lastEntry = messages[messages.length - 1]

    // FIX: 支持多轮对话的自动刷新
    // 检测到完成状态（completed/failed）或 agent hook 的 task_complete 事件时刷新
    const isCompletedStatus = lastEntry?.status === 'completed' || lastEntry?.status === 'failed'
    const isTaskCompleteEvent = lastEntry?.type === 'agent_hook' && lastEntry?.originalEvent?.type === 'task_complete'

    if (isCompletedStatus || isTaskCompleteEvent) {
      console.log('✅ 检测到任务完成事件:', {
        status: lastEntry?.status,
        type: lastEntry?.type,
        eventType: lastEntry?.originalEvent?.type,
        message: '，重新获取任务详情'
      })

      // 重新获取任务详情
      const fetchUpdatedDetails = async () => {
        try {
          const updatedTask = await tasksAPI.getTaskDetails(id)
          console.log('✅ 已获取更新后的任务详情:', updatedTask)
          setTask(updatedTask)
          setLoading(false)
          // 只有在首次成功获取数据时才结束 initialLoading
          if (!hasInitialData.current) {
            hasInitialData.current = true
            setInitialLoading(false)
          }
          setPolling(false)

          // 清除轮询
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (error) {
          console.error('❌ 获取更新后的任务详情失败:', error)
        }
      }

      fetchUpdatedDetails()
    }
  }, [messages, id])

  useEffect(() => {
    // 清理之前的 interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    const fetchTaskDetails = async () => {
      try {
        console.log('正在查询任务详情:', id)
        const task = await tasksAPI.getTaskDetails(id)
        console.log('任务详情查询成功:', task)
        setTask(task)
        setError('')
        setLoading(false)

        // 检查 artifacts 的收藏状态
        if (task.artifacts && task.artifacts.length > 0) {
          checkFavoritesStatus(task.artifacts)
        }
        // 只有在首次成功获取数据时才结束 initialLoading
        if (!hasInitialData.current) {
          hasInitialData.current = true
          setInitialLoading(false)
        }
        return { found: true, error: null }
      } catch (error) {
        console.error('查询任务详情失败:', error)
        setLoading(false)
        // 不要在失败时结束 initialLoading，让用户看到"加载中..."而不是"执行中"

        // 处理 404 错误：404 = Not Found，直接停止轮询
        if (error.response?.status === 404) {
          console.error('任务不存在:', id)
          setError('任务不存在')
          setInitialLoading(false) // 404时结束加载，显示错误
          return { found: false, error: true, taskNotFound: true }
        }

        // 其他错误
        setError('获取任务详情失败')
        return { found: false, error: true }
      }
    }

    let pollCount = 0
    const maxPolls = 60 // 最多轮询60次（约1分钟）

    const startPolling = async () => {
      setPolling(true)
      pollCount = 0

      const poll = async () => {
        pollCount++
        console.log('轮询次数:', pollCount, '任务ID:', id)
        const result = await fetchTaskDetails()

        // 如果找到任务、出错、任务不存在或达到最大轮询次数，停止轮询
        if (result.found || result.error || result.taskNotFound || pollCount >= maxPolls) {
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          if (result.taskNotFound) {
            // 任务不存在，停止轮询，不设置额外错误
            console.log('任务不存在，停止轮询')
          } else if (result.error && !result.taskNotFound) {
            setError('获取任务详情失败')
          } else if (!result.found && pollCount >= maxPolls) {
            setError('任务执行超时，请稍后刷新页面重试')
          }
        }
      }

      // 立即执行一次
      await poll()

      // 如果还没找到、没有错误、且任务不是不存在，开始轮询
      if (pollCount < maxPolls && !error && !task && !polling) {
        pollIntervalRef.current = setInterval(poll, 1000) // 每秒轮询一次
      }
    }

    startPolling()

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [id])

  // 重置版本选择当任务更新时
  useEffect(() => {
    if (task?.artifacts) {
      const videoCount = task.artifacts.filter(a => a.type === 'video').length
      const imageCount = task.artifacts.filter(a => a.type === 'image').length
      const codeCount = task.artifacts.filter(a => a.type === 'code').length
      if (videoCount > 0) {
        // 重置为null，这样会自动选择最新的轮次
        setSelectedVideoIndex(null)
      }
      if (imageCount > 0) {
        // 重置为null，这样会自动选择最新的轮次
        setSelectedImageIndex(null)
      }
      if (codeCount > 0) {
        // 重置为null，这样会自动选择最新的轮次
        setSelectedCodeIndex(null)
      }
    }
  }, [task?.artifacts])

  // 确保 task 加载后初始任务消息被添加
  useEffect(() => {
    if (task && task.task && messagesRef.current.length > 0) {
      const initialUserMessage = {
        id: `initial-task-${id}`,
        type: 'chat',
        progressType: 'chat',
        role: 'user',
        content: task.task,
        timestamp: task.timestamp || new Date().toISOString(),
        metadata: {
          data: {
            sender: 'user',
            message: task.task
          }
        }
      }

      // 检查是否已经存在
      const hasInitialTask = messagesRef.current.some(
        msg => msg.id === `initial-task-${id}`
      )

      if (!hasInitialTask) {
        // 添加到开头
        messagesRef.current.unshift(initialUserMessage)
        setMessages(prev => [...messagesRef.current])
        console.log('[Task Loaded] 添加初始任务消息:', task.task)
      }
    }
  }, [task?.task, id])

  // 获取或生成sessionId
  useEffect(() => {
    if (!id) return

    // 1. 尝试从sessionStorage获取
    const storedSessionId = sessionStorage.getItem(`sessionId_${id}`)
    if (storedSessionId) {
      setSessionId(storedSessionId)
      console.log('使用已存在的sessionId:', storedSessionId)
      return
    }

    // 2. 如果没有存储的sessionId，生成新的
    const newSessionId = uuidv4()
    setSessionId(newSessionId)
    sessionStorage.setItem(`sessionId_${id}`, newSessionId)
    console.log('生成新的sessionId:', newSessionId)
  }, [id])

  // 发送对话消息
  const handleSendMessage = async () => {
    // 防止重复发送
    if (isSending) {
      console.warn('消息正在发送中，请勿重复点击')
      return
    }

    if (!inputValue.trim() || !sessionId) {
      if (!sessionId) {
        console.error('sessionId未初始化')
        alert('会话未初始化，请刷新页面重试')
      }
      return
    }

    // 发送到后端，包含sessionId
    setIsSending(true)
    try {
      await agentsAPI.sendChatMessage(id, inputValue, sessionId)
      console.log('消息已发送，sessionId:', sessionId)
      // 清除之前的发送错误
      setErrors(prev => prev.filter(e => e.type !== 'send'))
    } catch (error) {
      console.error('发送消息失败:', error)
      const errorObj = {
        type: 'send',
        message: '发送消息失败，请重试',
        timestamp: new Date(),
        id: Date.now().toString(),
        retry: () => handleSendMessage()
      }
      setErrors(prev => [...prev, errorObj])
    } finally {
      setIsSending(false)
      setInputValue('')
    }
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

  // 消息分组辅助函数（将时间接近的消息分组）
  const groupMessagesByTime = (messages, groupInterval = 60000) => {
    if (messages.length === 0) return []

    const groups = []
    let currentGroup = [messages[0]]

    for (let i = 1; i < messages.length; i++) {
      const currentMsg = messages[i]
      const prevMsg = currentGroup[currentGroup.length - 1]

      const currentTime = new Date(currentMsg.timestamp).getTime()
      const prevTime = new Date(prevMsg.timestamp).getTime()

      // 如果时间间隔小于阈值，添加到当前分组
      if (currentTime - prevTime < groupInterval) {
        currentGroup.push(currentMsg)
      } else {
        // 否则，开始新分组
        groups.push(currentGroup)
        currentGroup = [currentMsg]
      }
    }

    // 添加最后一个分组
    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }

  // 格式化分组时间戳
  const formatGroupTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`
    return date.toLocaleDateString()
  }

  // 获取结果类型的显示标题
  const getResultTypeLabel = (result) => {
    // 统一使用"展示区"作为标题
    return '展示区'
  }

  // 检测结果类型
  const getResultType = (result) => {
    if (!result) {
      return 'text'
    }

    // 优先：从顶层 structuredOutput 获取（新格式）
    if (typeof result === 'object' && result.structuredOutput?.result_type) {
      const resultType = result.structuredOutput.result_type

      // 映射 result_type 到显示类型
      const typeMapping = {
        'infographic': 'image',
        'video': 'video',
        'image': 'image',
        'audio': 'audio',
        'table': 'table',
        'code': 'code',
        'markdown': 'markdown',
        'html': 'html',
        'json': 'json',
      }

      return typeMapping[resultType] || resultType
    }

    // 兼容旧格式：从 metadata.structuredOutput 获取
    if (typeof result === 'object' && result.metadata?.structuredOutput?.result_type) {
      const resultType = result.metadata.structuredOutput.result_type

      const typeMapping = {
        'infographic': 'image',
        'video': 'video',
        'image': 'image',
        'audio': 'audio',
        'table': 'table',
        'code': 'code',
        'markdown': 'markdown',
        'html': 'html',
        'json': 'json',
      }

      return typeMapping[resultType] || resultType
    }

    // 兜底：如果没有 structuredOutput，返回 'text'
    return 'text'
  }

  // 从output字符串中提取URL和统一结果
  const extractParsedResult = (result) => {
    // 优先：从顶层 structuredOutput 获取（新格式）
    if (typeof result === 'object' && result.structuredOutput) {
      return result.structuredOutput
    }

    // 兼容旧格式：从 metadata.structuredOutput 获取
    if (typeof result === 'object' && result.metadata?.structuredOutput) {
      return result.metadata.structuredOutput
    }

    // 兜底：返回原始结果
    return result
  }

  // 获取媒体文件的Blob URL
  // 渲染 Stream 内容（实时日志）
  const renderStreamContent = () => {
    // streamData 是来自 Motia SDK 的对象数组，每个对象包含 id 和其他字段
    const entries = Array.isArray(messages) ? messages : []

    if (entries.length === 0) {
      return (
        <div className="stream-content">
          <div className="no-stream-data">
            <p>暂无实时日志数据</p>
            <p className="hint">任务执行时会显示实时进度和心跳信息</p>
          </div>
        </div>
      )
    }

    return (
      <div className="stream-content">
        <div className="stream-header">
          <h3>任务执行日志</h3>
          <div className="stream-info">
            <span className="stream-count">{entries.length} 条记录</span>
            <span className="stream-live">● WebSocket 实时连接</span>
          </div>
        </div>
        <div className="stream-entries">
          {entries.map((entry) => {
            // entry 是对象，包含 id, type, status, message, timestamp 等字段
            const statusConfig = getStatusConfig(entry.status)
            const statusLabel = statusConfig?.label || entry.status || '等待中'
            const statusColor = statusConfig?.color || '#64748B'
            const statusBgColor = statusConfig?.bgColor || '#F1F5F9'

            return (
              <div key={entry.id} className={`stream-entry stream-entry-${entry.status || 'info'}`}>
                <div className="entry-header">
                  <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span
                    className="entry-status"
                    style={{
                      color: statusColor,
                      backgroundColor: statusBgColor,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    {statusLabel}
                  </span>
                  {entry.type && <span className="entry-type">{entry.type === 'task' ? '任务' : '技能'}</span>}
                  {entry.skill && <span className="entry-skill">{entry.skill}</span>}
                  {entry.stage && <span className="entry-stage">{entry.stage}</span>}
                  {entry.progressType && <span className="entry-progress-type">{entry.progressType}</span>}
                </div>
                {entry.task && <div className="entry-task">{entry.task}</div>}
                {entry.message && <div className="entry-output">{entry.message}</div>}
                {entry.error && <div className="entry-error">{entry.error}</div>}
                {entry.metadata?.data && (
                  <div className="entry-metadata">
                    <pre>{JSON.stringify(entry.metadata.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const getMediaBlobUrl = async (path) => {
    if (mediaUrls[path]) {
      console.log('[getMediaBlobUrl] Using cached URL for:', path)
      return mediaUrls[path]
    }

    try {
      // 使用查询参数格式：/media?path=xxx 而不是 /media/xxx
      const url = `${API_BASE_URL}/media?path=${encodeURIComponent(path)}`
      console.log('[getMediaBlobUrl] Fetching:', url)

      const response = await fetch(url)
      console.log('[getMediaBlobUrl] Response status:', response.status)
      console.log('[getMediaBlobUrl] Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
      }

      const blob = await response.blob()
      console.log('[getMediaBlobUrl] Blob size:', blob.size, 'type:', blob.type)

      const blobUrl = URL.createObjectURL(blob)
      console.log('[getMediaBlobUrl] Created blob URL:', blobUrl, 'for path:', path)

      setMediaUrls(prev => ({ ...prev, [path]: blobUrl }))
      return blobUrl
    } catch (error) {
      console.error('[getMediaBlobUrl] Error fetching media file:', error)
      return null
    }
  }

  // 渲染可视化内容（视频、图片等）
  const renderVisualContent = (result) => {
    const parsedResult = extractParsedResult(result)
    const resultType = getResultType(result)

    // 检查是否有多个视频版本（从 artifacts）
    const videoArtifacts = task?.artifacts
      ? task.artifacts
          .filter(artifact => artifact.type === 'video')
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      : [];

    const hasMultipleVersions = videoArtifacts.length > 1;

    // 如果有多个版本，使用选中的版本
    let currentVideoPath = parsedResult.content?.path;
    let currentVideoMetadata = parsedResult.content;

    // 优先使用 artifacts 中的视频（如果有）
    if (videoArtifacts.length > 0) {
      const currentIndex = selectedVideoIndex !== null
        ? selectedVideoIndex
        : videoArtifacts.length - 1; // 默认最后一轮

      const selectedArtifact = videoArtifacts[currentIndex];
      currentVideoPath = selectedArtifact.path;
      // 从 artifact 获取元数据（如果有）
      currentVideoMetadata = {
        path: selectedArtifact.path,
        mime_type: 'video/mp4',
        description: selectedArtifact.description,
      };
    }

    if (videoArtifacts.length > 0 && currentVideoPath) {
      // 处理视频（优先从 artifacts）
      let videoPath = currentVideoPath
      // 移除前导的/outputs/如果存在
      videoPath = videoPath.replace(/^\/?outputs\//, '')

      const currentIndex = selectedVideoIndex !== null
        ? selectedVideoIndex
        : videoArtifacts.length - 1;
      const selectedArtifact = videoArtifacts[currentIndex];

      return (
        <div className="result-visual">
          {/* 版本选择器 - 始终显示，统一体验 */}
          <div className="video-version-selector">
            <span className="version-label">轮次</span>
            <div className="version-dropdown-wrapper">
              <select
                value={selectedVideoIndex !== null ? selectedVideoIndex : videoArtifacts.length - 1}
                onChange={(e) => setSelectedVideoIndex(parseInt(e.target.value))}
                className="version-dropdown"
              >
                {videoArtifacts.map((artifact, index) => {
                  const isLatest = index === videoArtifacts.length - 1;
                  const time = new Date(artifact.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });

                  return (
                    <option key={artifact.id} value={index}>
                      第 {index + 1} 轮 · {time}
                      {isLatest ? ' · 最新' : ''}
                    </option>
                  );
                })}
              </select>
              <svg className="dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* 版本描述 - 内联显示 */}
            {(() => {
              const artifact = videoArtifacts[currentIndex];
              const fullDescription = artifact?.description || '';

              return (
                <Tooltip content={fullDescription}>
                  <span className="version-description-inline">
                    {fullDescription}
                  </span>
                </Tooltip>
              );
            })()}
            {/* 收藏按钮 */}
            <div className="artifact-actions">
              {favoriteArtifacts.has(selectedArtifact.id) ? (
                <button
                  className="favorite-btn active"
                  onClick={() => {
                    const favoriteId = `favorite-${selectedArtifact.id}`
                    handleRemoveFromFavorites(favoriteId, selectedArtifact.id)
                  }}
                  disabled={loadingFavorites}
                  title="从精选移除"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              ) : (
                <button
                  className="favorite-btn"
                  onClick={() => handleAddToFavorites(selectedArtifact.id)}
                  disabled={loadingFavorites}
                  title="添加到精选"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 视频播放器 */}
          <div className="video-player-wrapper">
            <VideoPlayer
              key={videoPath}
              videoPath={videoPath}
              duration={currentVideoMetadata.duration}
              fps={currentVideoMetadata.fps}
              size={currentVideoMetadata.size}
              getBlobUrl={getMediaBlobUrl}
            />
          </div>
        </div>
      )
    }

    // 显示 code artifacts
    const codeArtifacts = task?.artifacts
      ? task.artifacts
        .filter(artifact => artifact.type === 'code')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      : [];

    if (codeArtifacts.length > 0) {
      const currentIndex = selectedCodeIndex !== null
        ? selectedCodeIndex
        : codeArtifacts.length - 1; // 默认最后一轮

      const selectedArtifact = codeArtifacts[currentIndex];
      let codePath = selectedArtifact.path;
      // 移除前导的/outputs/如果存在
      codePath = codePath.replace(/^\/?outputs\//, '');

      return (
        <div className="result-visual result-visual-with-code">
          {/* 版本选择器 - 始终显示，统一体验 */}
          <div className="video-version-selector">
            <span className="version-label">轮次</span>
            <div className="version-dropdown-wrapper">
              <select
                value={selectedCodeIndex !== null ? selectedCodeIndex : codeArtifacts.length - 1}
                onChange={(e) => setSelectedCodeIndex(parseInt(e.target.value))}
                className="version-dropdown"
              >
                {codeArtifacts.map((artifact, index) => {
                  const isLatest = index === codeArtifacts.length - 1;
                  const time = new Date(artifact.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });

                  return (
                    <option key={artifact.id} value={index}>
                      第 {index + 1} 轮 · {time}
                      {isLatest ? ' · 最新' : ''}
                    </option>
                  );
                })}
              </select>
              <svg className="dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* 版本描述 */}
            {(() => {
              const currentIndex = selectedCodeIndex !== null ? selectedCodeIndex : codeArtifacts.length - 1;
              const artifact = codeArtifacts[currentIndex];
              const fullDescription = artifact?.description || '';

              return (
                <Tooltip content={fullDescription}>
                  <span className="version-description-inline">
                    {fullDescription}
                  </span>
                </Tooltip>
              );
            })()}
            {/* 收藏按钮 */}
            <div className="artifact-actions">
              {favoriteArtifacts.has(selectedArtifact.id) ? (
                <button
                  className="favorite-btn active"
                  onClick={() => {
                    const favoriteId = `favorite-${selectedArtifact.id}`
                    handleRemoveFromFavorites(favoriteId, selectedArtifact.id)
                  }}
                  disabled={loadingFavorites}
                  title="从精选移除"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              ) : (
                <button
                  className="favorite-btn"
                  onClick={() => handleAddToFavorites(selectedArtifact.id)}
                  disabled={loadingFavorites}
                  title="添加到精选"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 代码查看器 */}
          <CodeViewer
            codePath={codePath}
            getBlobUrl={getMediaBlobUrl}
            language={selectedArtifact.metadata?.language}
          />
        </div>
      )
    }

    // 检查是否有多个图片版本（从 artifacts）
    const imageArtifacts = task?.artifacts
      ? task.artifacts
          .filter(artifact => artifact.type === 'image')
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      : [];

    // 处理多轮图片（优先从 artifacts）
    if (imageArtifacts.length > 0) {
      const currentIndex = selectedImageIndex !== null
        ? selectedImageIndex
        : imageArtifacts.length - 1; // 默认最后一轮

      const selectedArtifact = imageArtifacts[currentIndex];
      let imagePath = selectedArtifact.path;
      // 移除前导的/outputs/如果存在
      imagePath = imagePath.replace(/^\/?outputs\//, '');

      return (
        <div className="result-visual">
          {/* 版本选择器 - 始终显示，统一体验 */}
          <div className="video-version-selector">
            <span className="version-label">轮次</span>
            <div className="version-dropdown-wrapper">
              <select
                value={selectedImageIndex !== null ? selectedImageIndex : imageArtifacts.length - 1}
                onChange={(e) => setSelectedImageIndex(parseInt(e.target.value))}
                className="version-dropdown"
              >
                {imageArtifacts.map((artifact, index) => {
                  const isLatest = index === imageArtifacts.length - 1;
                  const time = new Date(artifact.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });

                  return (
                    <option key={artifact.id} value={index}>
                      第 {index + 1} 轮 · {time}
                      {isLatest ? ' · 最新' : ''}
                    </option>
                  );
                })}
              </select>
              <svg className="dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* 版本描述 */}
            {(() => {
              const currentIndex = selectedImageIndex !== null ? selectedImageIndex : imageArtifacts.length - 1;
              const artifact = imageArtifacts[currentIndex];
              const fullDescription = artifact?.description || '';

              return (
                <Tooltip content={fullDescription}>
                  <span className="version-description-inline">
                    {fullDescription}
                  </span>
                </Tooltip>
              );
            })()}
            {/* 收藏按钮 */}
            <div className="artifact-actions">
              {favoriteArtifacts.has(selectedArtifact.id) ? (
                <button
                  className="favorite-btn active"
                  onClick={() => {
                    const favoriteId = `favorite-${selectedArtifact.id}`
                    handleRemoveFromFavorites(favoriteId, selectedArtifact.id)
                  }}
                  disabled={loadingFavorites}
                  title="从精选移除"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              ) : (
                <button
                  className="favorite-btn"
                  onClick={() => handleAddToFavorites(selectedArtifact.id)}
                  disabled={loadingFavorites}
                  title="添加到精选"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.67 6.5L12 17.77l-6.67 2.87 1.67-6.5L2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 图片播放器 */}
          <ImagePlayer
            key={imagePath}
            imagePath={imagePath}
            getBlobUrl={getMediaBlobUrl}
          />
        </div>
      )
    }

    if (resultType === 'image' && parsedResult.content?.path) {
      // 处理图片
      let imagePath = parsedResult.content.path
      // 移除前导的/outputs/如果存在
      imagePath = imagePath.replace(/^\/?outputs\//, '')

      return (
        <div className="result-visual">
          <ImagePlayer
            imagePath={imagePath}
            getBlobUrl={getMediaBlobUrl}
          />
        </div>
      )
    }

    if (resultType === 'table') {
      // 处理表格
      const structured = extractParsedResult(result)
      const { content } = structured
      if (!content || !content.columns || !content.rows) {
        return (
          <div className="no-result">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3h18v18H3z" />
              <path d="M3 9h18" />
              <path d="M9 3v18" />
            </svg>
            <p>无效的表格数据</p>
            <span className="hint">请检查数据格式是否包含 columns 和 rows</span>
          </div>
        )
      }

      // 使用组件顶层的表格状态
      const rowsPerPage = 25

      // 过滤和排序数据
      const filteredAndSortedRows = content.rows.filter(row => {
        if (!tableSearchQuery) return true
        return row.some(cell =>
          String(cell).toLowerCase().includes(tableSearchQuery.toLowerCase())
        )
      }).sort((a, b) => {
        if (!tableSortColumn) return 0
        const aVal = a[tableSortColumn]
        const bVal = b[tableSortColumn]
        const compare = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return tableSortDirection === 'asc' ? compare : -compare
      })

      // 分页
      const totalPages = Math.ceil(filteredAndSortedRows.length / rowsPerPage)
      const paginatedRows = filteredAndSortedRows.slice(
        (tableCurrentPage - 1) * rowsPerPage,
        tableCurrentPage * rowsPerPage
      )

      const handleSort = (colIndex) => {
        if (tableSortColumn === colIndex) {
          setTableSortDirection(tableSortDirection === 'asc' ? 'desc' : 'asc')
        } else {
          setTableSortColumn(colIndex)
          setTableSortDirection('asc')
        }
      }

      const handleSearchChange = (e) => {
        setTableSearchQuery(e.target.value)
        setTableCurrentPage(1) // 重置到第一页
      }

      return (
        <div className="result-table">
          <div className="table-controls">
            <div className="table-search-wrapper">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="table-search-icon"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="搜索表格内容..."
                className="table-search"
                value={tableSearchQuery}
                onChange={handleSearchChange}
              />
              {tableSearchQuery && (
                <button
                  className="table-search-clear"
                  onClick={() => {
                    setTableSearchQuery('')
                    setTableCurrentPage(1)
                  }}
                  aria-label="清除搜索"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="table-stats">
              <span className="table-row-count">
                {filteredAndSortedRows.length} 行
              </span>
              {tableSearchQuery && (
                <span className="table-filter-indicator">
                  已过滤
                </span>
              )}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {content.columns.map((col, i) => (
                    <th
                      key={i}
                      onClick={() => handleSort(i)}
                      className={tableSortColumn === i ? `sorted-${tableSortDirection}` : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="th-content">
                        <span>{col}</span>
                        {tableSortColumn === i && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="sort-icon"
                          >
                            {tableSortDirection === 'asc' ? (
                              <path d="M12 19V5M5 12l7-7 7 7" />
                            ) : (
                              <path d="M12 5v14M5 12l7 7 7-7" />
                            )}
                          </svg>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row, i) => (
                    <tr key={(tableCurrentPage - 1) * rowsPerPage + i}>
                      {row.map((cell, j) => (
                        <td key={j} title={String(cell)}>
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={content.columns.length} className="table-no-results">
                      <div className="table-empty-state">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        <p>未找到匹配结果</p>
                        <span className="hint">尝试调整搜索关键词</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="table-pagination">
              <button
                className="pagination-button"
                onClick={() => setTableCurrentPage(p => Math.max(1, p - 1))}
                disabled={tableCurrentPage === 1}
                aria-label="上一页"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div className="pagination-info">
                <span className="pagination-current">{tableCurrentPage}</span>
                <span className="pagination-separator">/</span>
                <span className="pagination-total">{totalPages}</span>
              </div>

              <button
                className="pagination-button"
                onClick={() => setTableCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={tableCurrentPage === totalPages}
                aria-label="下一页"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              <select
                className="pagination-rows-per-page"
                value={rowsPerPage}
                disabled // 暂时禁用，因为 rowsPerPage 是常量
                aria-label="每页显示行数"
              >
                <option value="25">25 行/页</option>
                <option value="50">50 行/页</option>
                <option value="100">100 行/页</option>
              </select>
            </div>
          )}
        </div>
      )
    }

    // 新增：代码渲染（使用新格式）
    if (resultType === 'code') {
      const structured = extractParsedResult(result)

      // 新格式：structured.content 包含 {code, language, filename}
      if (structured.content?.code) {
        // 调试：检查代码格式
        console.log('[CodePlayer Debug] structured.content:', structured.content)
        console.log('[CodePlayer Debug] code type:', typeof structured.content.code)
        console.log('[CodePlayer Debug] code length:', structured.content.code.length)
        console.log('[CodePlayer Debug] first 200 chars:', structured.content.code.substring(0, 200))
        console.log('[CodePlayer Debug] has newlines:', structured.content.code.includes('\n'))

        return (
          <div className="result-visual result-visual-code">
            <CodePlayer
              code={structured.content.code}
              language={structured.content.language || 'text'}
              filename={structured.content.filename || ''}
            />
          </div>
        )
      }

      // 兜底：显示错误信息
      return (
        <div className="result-error">
          <p>Invalid code format: missing content.code</p>
          <pre>{JSON.stringify(structured, null, 2)}</pre>
        </div>
      )
    }

    // 新增：音频渲染
    if (resultType === 'audio') {
      const audioPath = typeof parsedResult === 'object' ? (parsedResult.content?.path || parsedResult.path || parsedResult.audio_path) : null
      const audioUrl = typeof parsedResult === 'object' ? parsedResult.url || parsedResult.audio_url : null
      const filename = typeof parsedResult === 'object' ? parsedResult.filename || parsedResult.content?.filename : ''

      return (
        <div className="result-visual">
          <AudioPlayer audioPath={audioPath} audioUrl={audioUrl} getBlobUrl={getMediaBlobUrl} filename={filename} />
        </div>
      )
    }

    // 新增：Markdown/HTML 渲染
    if (resultType === 'markdown' || resultType === 'html') {
      const content = typeof result === 'object' ? result.content || result.text || result.html : result
      const filename = typeof result === 'object' ? result.filename || result.path : ''

      return (
        <div className="result-visual">
          <HtmlRenderer content={content} type={resultType} filename={filename} />
        </div>
      )
    }

    // 新增：JSON 渲染（作为代码显示）
    if (resultType === 'json') {
      let jsonContent = ''
      if (typeof result === 'object') {
        jsonContent = result.content || result.data || result.json || JSON.stringify(result, null, 2)
      } else {
        jsonContent = result
      }

      return (
        <div className="result-visual">
          <CodePlayer code={jsonContent} language="json" filename="result.json" />
        </div>
      )
    }

    return <div className="no-visual">此结果类型不支持可视化预览</div>
  }

  // 渲染文本内容
  const renderTextContent = (result) => {
    let textContent = ''

    if (typeof result === 'string') {
      // 过滤掉调试信息和多余内容
      textContent = result
        .split('\n')
        .filter(line => {
          // 过滤掉DEBUG信息
          if (line.trim().startsWith('[DEBUG]')) return false
          // 过滤掉成功消息
          if (line.trim().startsWith('success=True')) return false
          if (line.trim().startsWith('✅')) return false
          if (line.trim().startsWith('📸')) return false
          // 过滤掉长输出语句
          if (line.includes('export=') && line.length > 200) return false
          return true
        })
        .join('\n')
        .trim()

      // 如果过滤后为空或太短，显示有用的信息
      if (textContent.length < 10) {
        // 尝试提取关键信息
        const urlMatch = result.match(/(https?:\/\/[^\s]+)/)
        if (urlMatch) {
          textContent = `结果URL: ${urlMatch[1]}`
        } else if (result.includes('output=')) {
          // 如果有output=，提取这个值
          const outputMatch = result.match(/output\s*=\s*({[^}]+})/s)
          if (outputMatch) {
            textContent = `任务执行成功\n\n${outputMatch[1]}`
          }
        } else {
          textContent = result || '暂无文本内容'
        }
      }
    } else if (typeof result === 'object') {
      // 新增：检查 output 属性（原始 stdout）
      if (result.output && typeof result.output === 'string') {
        // 对 output 应用相同的过滤逻辑
        textContent = result.output
          .split('\n')
          .filter(line => {
            if (line.trim().startsWith('[DEBUG]')) return false
            if (line.trim().startsWith('success=True')) return false
            if (line.trim().startsWith('✅')) return false
            if (line.trim().startsWith('📸')) return false
            if (line.includes('export=') && line.length > 200) return false
            return true
          })
          .join('\n')
          .trim()
      } else if (result.text) {
        textContent = result.text
      } else if (result.content?.text) {
        textContent = result.content.text
      } else {
        textContent = JSON.stringify(result, null, 2)
      }
    }

    return (
      <div className="result-text-content">
        <pre className="result-text">{textContent || '暂无文本内容'}</pre>
      </div>
    )
  }

  // 获取 Tab 的配置信息（icon 和 label）
  const getTabConfig = (tabName, resultType) => {
    const tabConfigs = {
      visual: {
        video: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
            </svg>
          ),
          label: '视频'
        },
        image: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
              <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
            </svg>
          ),
          label: '图片'
        },
        code: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2z"/>
              <path d="M6 4.5a.5.5 0 0 1 .5.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zM3.646 6.646a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L5.293 9l-1.647-1.646a.5.5 0 0 1 0-.708zm5.5 0a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L11.293 9l1.647-1.646a.5.5 0 0 1 0-.708z"/>
            </svg>
          ),
          label: '代码'
        },
        table: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="tab-icon">
              <rect x="1" y="2" width="14" height="12" rx="1.5" />
              <line x1="1" y1="6" x2="15" y2="6" />
              <line x1="1" y1="10" x2="15" y2="10" />
              <line x1="5" y1="2" x2="5" y2="14" />
              <line x1="10" y1="2" x2="10" y2="14" />
            </svg>
          ),
          label: '表格'
        },
        audio: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tab-icon">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          ),
          label: '音频'
        },
        markdown: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
            </svg>
          ),
          label: 'Markdown'
        },
        html: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M1.5 0h11.586a1.5 1.5 0 0 1 1.06.44l1.414 1.414A1.5 1.5 0 0 1 16 2.914V14.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0zM1 1.5v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V2.914a.5.5 0 0 0-.146-.353l-1.415-1.415A.5.5 0 0 0 12.086 1H1.5a.5.5 0 0 0-.5.5zM4.5 5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM3 8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 0-1h-6A.5.5 0 0 0 3 8zm0 2.5a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 0-1h-6a.5.5 0 0 0-.5.5z"/>
            </svg>
          ),
          label: 'HTML'
        },
        json: {
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
          ),
          label: 'JSON'
        }
      },
      text: {
        label: '原始数据'
      }
    }

    // 返回对应类型的配置，如果没有匹配则返回默认配置
    return tabConfigs[tabName]?.[resultType] || tabConfigs[tabName]?.video || { icon: null, label: '内容' }
  }

  const renderResult = (result) => {
    if (!result) {
      return <div className="no-result">暂无结果</div>
    }

    const resultType = getResultType(result)
    const hasVisual = ['video', 'image', 'table', 'code', 'audio', 'markdown', 'html', 'json'].includes(resultType)

    // 获取 visual tab 的配置
    const visualTabConfig = getTabConfig('visual', resultType)

    return (
      <div className="result-container">
        {/* Tab切换 */}
        <div className="result-tabs">
          {hasVisual && (
            <>
              <button
                className={`tab-button ${activeTab === 'visual' ? 'active' : ''}`}
                onClick={() => setActiveTab('visual')}
              >
                {visualTabConfig.icon}
                {visualTabConfig.label}
              </button>
              <button
                className={`tab-button ${activeTab === 'text' ? 'active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="tab-icon">
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                  <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                原始数据
              </button>
            </>
          )}
        </div>

        {/* 内容区域 */}
        <div className="result-content">
          {hasVisual ? (
            <>
              {activeTab === 'visual' && renderVisualContent(result)}
              {activeTab === 'text' && renderTextContent(result)}
            </>
          ) : (
            renderTextContent(result)
          )}
        </div>
      </div>
    )
  }

  // 消息分组组件
  const MessageGroup = ({ group }) => {
    if (group.length === 0) return null

    const firstMessage = group[0]
    const groupTimestamp = formatGroupTimestamp(firstMessage.timestamp)

    return (
      <div className="message-group">
        <div className="group-timestamp">{groupTimestamp}</div>
        {group.map(msg => (
          msg.progressType === 'chat' ? (
            <ChatBubble key={msg.id || msg.timestamp} message={msg} />
          ) : (
            <MessageBubble key={msg.id || msg.timestamp} message={msg} />
          )
        ))}
      </div>
    )
  }

  // 消息气泡组件 - 统一的对话流样式
  const MessageBubble = ({ message }) => {
    // 获取类型图标
    const getTypeIcon = () => {
      // 特殊类型：intent_analysis 和 ptc_planning
      if (message.type === 'intent_analysis') {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
          </svg>
        )
      }

      if (message.type === 'ptc_planning') {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            <path d="M9 14h6M9 10h6M9 18h6"/>
          </svg>
        )
      }

      // 标准类型：task, agent, skill
      if (message.type === 'task') {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4"/>
          </svg>
        )
      }

      if (message.type === 'skill') {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        )
      }

      if (message.type === 'agent_hook') {
        // Agent pre 和 post 使用机器人图标（绿色）
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <line x1="8" y1="16" x2="8" y2="16"/>
            <line x1="16" y1="16" x2="16" y2="16"/>
          </svg>
        )
      }

      // 默认图标
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
      )
    }

    // 获取阶段图标（小）
    const getStageIcon = () => {
      if (message.stage === 'pre') {
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
            <path d="M5 12h14"/>
          </svg>
        )
      }
      if (message.stage === 'post') {
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
            <path d="M9 12l2 2 4-4"/>
          </svg>
        )
      }
      if (message.stage === 'processing') {
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" className="stage-icon spinning">
            <path d="M12 2v4m0 4v4m0 4h4m-4 0h4"/>
          </svg>
        )
      }
      return null
    }

    const typeIcon = getTypeIcon()
    const stageIcon = getStageIcon()
    const statusConfig = getStatusConfig(message.status)

    // 根据消息类型格式化内容
    let content
    if (message.type === 'agent_hook') {
      // agent_hook 类型的消息已经通过 formatAgentHookMessage 格式化
      content = message.message || ''
    } else if (message.type === 'skill') {
      // skill 类型的消息需要特殊处理
      content = formatSkillMessage(message)
    } else {
      // 其他类型的消息显示 task 或 message
      content = message.task || message.message || ''
    }

    return (
      <div className="chat-bubble assistant">
        <div className="chat-avatar">
          {typeIcon}
        </div>
        <div className="chat-content">
          <div className="chat-message-header">
            {statusConfig && (
              <span
                className="chat-status-badge"
                style={{
                  color: statusConfig.color,
                  backgroundColor: statusConfig.bgColor
                }}
              >
                {statusConfig.icon}
                <span>{statusConfig.label}</span>
              </span>
            )}
            {message.type === 'skill' && message.skill && (
              <span className="chat-skill-name">{message.skill}</span>
            )}
            {stageIcon && <span className="chat-stage-icon">{stageIcon}</span>}
            <span className="chat-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="chat-message">{content}</div>
          {message.error && <div className="message-error">{message.error}</div>}
        </div>
      </div>
    )
  }

  // 自定义 Tooltip 组件 - 现代化设计
  const Tooltip = ({ children, content }) => {
    const [isVisible, setIsVisible] = useState(false)
    const [position, setPosition] = useState({ top: 0, left: 0 })
    const targetRef = useRef(null)

    const handleMouseEnter = (e) => {
      if (!content) return

      const rect = e.target.getBoundingClientRect()
      // 确保tooltip不会超出屏幕
      const tooltipMaxWidth = Math.min(500, window.innerWidth - rect.left - 20)

      setPosition({
        top: rect.bottom + 10,
        left: rect.left,
        maxWidth: tooltipMaxWidth
      })
      setIsVisible(true)
    }

    const handleMouseLeave = () => {
      setIsVisible(false)
    }

    return (
      <span
        ref={targetRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {children}
        {isVisible && content && (
          <div
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              backgroundColor: 'rgba(15, 23, 42, 0.98)',
              color: '#f8fafc',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              fontSize: '0.8125rem',
              lineHeight: '1.6',
              fontWeight: '400',
              maxWidth: `${position.maxWidth}px`,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              zIndex: 10000,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              pointerEvents: 'none',
              animation: 'tooltipFadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              maxHeight: '400px',
              overflowY: 'auto',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              // 自定义滚动条样式
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(148, 163, 184, 0.5) transparent'
            }}
          >
            {/* 添加一个小箭头指示器 */}
            <div
              style={{
                position: 'absolute',
                top: '-6px',
                left: '12px',
                width: '0',
                height: '0',
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '6px solid rgba(15, 23, 42, 0.98)',
                filter: 'drop-shadow(0 -2px 2px rgba(0, 0, 0, 0.1))'
              }}
            />
            {content}
          </div>
        )}
      </span>
    )
  }

  // 聊天气泡组件
  const ChatBubble = ({ message }) => {
    // 从后端数据结构中提取 role 和 content
    const isUser = message.metadata?.data?.sender === 'user' || message.role === 'user'
    const content = message.content || message.metadata?.data?.message || message.task || ''

    // 用户消息显示用户图标，助手消息显示机器人图标
    const getAvatar = () => {
      if (isUser) {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        )
      }
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <circle cx="12" cy="5" r="2"/>
          <path d="M12 7v4"/>
          <line x1="8" y1="16" x2="8" y2="16"/>
          <line x1="16" y1="16" x2="16" y2="16"/>
        </svg>
      )
    }

    return (
      <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="chat-avatar">
          {getAvatar()}
        </div>
        <div className="chat-content">
          <div className="chat-message-header">
            <span className="chat-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="chat-message">{content}</div>
        </div>
      </div>
    )
  }

  const handleDeleteTask = async () => {
    // ⭐ 停止轮询，防止在删除过程中显示 404 错误
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setPolling(false)

    // 确认删除
    if (!window.confirm(`确定要删除任务 ${task.taskId} 吗?此操作不可恢复。`)) {
      // 用户取消删除，恢复轮询
      setPolling(true)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (err) {
          console.error('轮询失败:', err)
        }
      }, 1000)
      return
    }

    try {
      console.log('=== 开始删除任务 ===')
      console.log('任务 ID:', task.taskId)

      const response = await tasksAPI.deleteTask(task.taskId)

      console.log('=== 删除成功 ===')
      console.log('响应对象:', response)
      console.log('响应数据:', response.data)
      console.log('响应状态:', response.status)

      // 删除成功后跳转回任务列表
      window.location.href = '/tasks'
    } catch (error) {
      console.error('=== 删除任务失败 ===')
      console.error('完整错误对象:', error)
      console.error('错误名称:', error.name)
      console.error('错误消息:', error.message)
      console.error('错误堆栈:', error.stack)

      if (error.response) {
        console.error('HTTP 状态码:', error.response.status)
        console.error('HTTP 状态文本:', error.response.statusText)
        console.error('响应头:', error.response.headers)
        console.error('响应数据:', error.response.data)
      } else if (error.request) {
        console.error('请求已发送但没有收到响应:', error.request)
      } else {
        console.error('请求设置错误:', error.message)
      }

      // 显示更详细的错误信息
      let errorMessage = '未知错误'

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.message) {
        errorMessage = error.message
      }

      alert(`删除任务失败: ${errorMessage}\n请查看浏览器控制台获取详细信息`)

      // 删除失败，恢复轮询
      setPolling(true)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setPolling(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } catch (err) {
          console.error('轮询失败:', err)
        }
      }, 1000)
    }
  }

  const handleRetryTask = async () => {
    if (retrying) return

    if (!window.confirm(`确定要重试任务 ${task.taskId} 吗?`)) {
      return
    }

    setRetrying(true)
    try {
      await tasksAPI.retryTask(task.taskId)

      // 重试成功，显示提示并保持当前页面状态
      alert('任务重试已启动，页面将自动更新')

      // 重新开始轮询任务状态
      setLoading(true)
      setPolling(true)
      setRetrying(false)

      // 使用现有的轮询逻辑，不再手动 reload
      // useEffect 会自动处理轮询
      const fetchTaskDetails = async () => {
        try {
          const task = await tasksAPI.getTaskDetails(id)
          setTask(task)
          setError('')
          setLoading(false)
          setPolling(false)
        } catch (error) {
          console.error('Error fetching task details:', error)
          if (error.response?.status === 404) {
            // 404 表示任务还在执行中，继续轮询
            setTimeout(fetchTaskDetails, 1000)
          } else {
            setError('获取任务详情失败')
            setLoading(false)
            setPolling(false)
          }
        }
      }

      fetchTaskDetails()
    } catch (error) {
      console.error('重试失败:', error)
      const errorMessage = error.response?.data?.message || '重试失败，请稍后重试'
      alert(errorMessage)
      setRetrying(false)
    }
  }

  // 添加到精选
  const handleAddToFavorites = async (artifactId) => {
    if (loadingFavorites) return

    setLoadingFavorites(true)
    try {
      await favoritesAPI.addFavorite(artifactId, task.taskId)

      // 更新收藏状态
      setFavoriteArtifacts(prev => new Set([...prev, artifactId]))
    } catch (error) {
      console.error('添加到精选失败:', error)
      const errorMessage = error.response?.data?.message || error.message || '添加失败'
      console.error(`添加失败: ${errorMessage}`)
    } finally {
      setLoadingFavorites(false)
    }
  }

  // 从精选移除
  const handleRemoveFromFavorites = async (favoriteId, artifactId) => {
    if (loadingFavorites) return

    setLoadingFavorites(true)
    try {
      await favoritesAPI.removeFavorite(favoriteId)

      // 更新收藏状态
      setFavoriteArtifacts(prev => {
        const newSet = new Set(prev)
        newSet.delete(artifactId)
        return newSet
      })
    } catch (error) {
      console.error('从精选移除失败:', error)
      const errorMessage = error.response?.data?.message || error.message || '移除失败'
      console.error(`移除失败: ${errorMessage}`)
    } finally {
      setLoadingFavorites(false)
    }
  }

  // 检查 artifacts 是否已被收藏
  const checkFavoritesStatus = async (artifacts) => {
    if (!artifacts || artifacts.length === 0) return

    try {
      // 批量检查收藏状态
      const checkPromises = artifacts.map(artifact =>
        favoritesAPI.isFavorite(artifact.id).catch(() => false)
      )

      const results = await Promise.all(checkPromises)
      const favoriteIds = new Set()

      results.forEach((isFavorite, index) => {
        if (isFavorite) {
          favoriteIds.add(artifacts[index].id)
        }
      })

      setFavoriteArtifacts(favoriteIds)
    } catch (error) {
      console.error('检查收藏状态失败:', error)
    }
  }

  if (loading || polling || initialLoading) {
    return (
      <div className="task-detail">
        {error ? (
          <div className="error">{error}</div>
        ) : initialLoading ? (
          <>
            <span className="spinner"></span>
            <span style={{ marginLeft: '1rem' }}>加载中...</span>
          </>
        ) : polling ? (
          <>
            <span className="spinner"></span>
            <span style={{ marginLeft: '1rem' }}>任务执行中，请稍候...</span>
          </>
        ) : (
          <>
            <span className="spinner"></span>
            <span style={{ marginLeft: '1rem' }}>加载中...</span>
          </>
        )}
      </div>
    )
  }

  if (!task) {
    return (
      <div className="task-detail">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="error">任务不存在</div>
        )}
      </div>
    )
  }

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <Link to="/tasks" className="back-link">
          ← 返回任务列表
        </Link>
        <button
          className="delete-button-detail"
          onClick={handleDeleteTask}
          title="删除任务"
          aria-label="删除任务"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>

      {/* 任务信息 */}
      <div className="task-info">
        <div className="info-section">
          <h2>任务信息</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">任务 ID:</span>
              <span className="info-value">{task.taskId}</span>
            </div>
            <div className="info-item">
              <span className="info-label">状态:</span>
              <div className="info-value-with-action">
                <span className={`info-value status status-${task.executionTime === null ? (task.status === 'started' ? 'started' : 'running') : (task.success ? 'completed' : 'failed')}`}>
                  {task.executionTime === null ? (task.status === 'started' ? '已开始' : '执行中') : (task.success ? '成功' : '失败')}
                </span>
                {task.executionTime !== null && !task.success && (
                  <button
                    className="retry-button"
                    onClick={handleRetryTask}
                    disabled={retrying}
                    title="重新执行此任务"
                    aria-label="重新执行此任务"
                  >
                    {retrying ? (
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
            <div className="info-item">
              <span className="info-label">创建时间:</span>
              <span className="info-value">{formatDate(task.timestamp)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">执行时间:</span>
              <span className="info-value">{formatDuration(task.executionTime)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">产物数:</span>
              <span className="info-value">{task.artifacts?.length || 0} 个</span>
            </div>
            {task.metadata?.skillNames && task.metadata.skillNames.length > 0 && (
              <div className="info-item">
                <span className="info-label">技能:</span>
                <div className="skill-badges">
                  {task.metadata.skillNames.map((skill, index) => (
                    <span key={index} className="skill-badge">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {task.metadata?.delegates && task.metadata.delegates.length > 0 && (
              <div className="info-item">
                <span className="info-label">委派给:</span>
                <div className="delegate-badges">
                  {task.metadata.delegates.map((delegate, index) => (
                    <span key={index} className="delegate-badge">
                      🤖 {delegate}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="info-item full-width">
              <span className="info-label">任务内容:</span>
              <div className="task-content">
                <pre>{task.task}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

          {/* 混合UI区域：左侧进度流 + 右侧结果区 */}
        <div className="hybrid-ui-container">
          {/* 左侧进度流区域 */}
          <div className="progress-stream">
            <div className="progress-stream-header">
              <h3>任务执行进度</h3>
              <span className="stream-count">{messages.length} 条消息</span>
            </div>
            <div className="progress-stream-content">
              {/* 统一的消息列表：进度流 + 聊天（使用分组） */}
              {(() => {
                // 按时间排序所有消息
                const allMessages = [...messages].sort((a, b) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                )

                // 分组消息
                const groupedMessages = groupMessagesByTime(allMessages)

                return groupedMessages.length > 0 ? (
                  groupedMessages.map((group, index) => (
                    <MessageGroup key={`group-${index}`} group={group} />
                  ))
                ) : (
                  <div className="no-progress-data">
                    <p>暂无任务执行数据</p>
                    <p className="hint">任务执行时会显示实时进度信息</p>
                  </div>
                )
              })()}
            </div>

            {/* 错误消息显示 */}
            {errors.length > 0 && (
              <div className="error-messages">
                {errors.map(error => (
                  <div key={error.id} className="error-message-item">
                    <span className="error-text">{error.message}</span>
                    {error.retry && (
                      <button onClick={error.retry} className="error-retry-button">
                        重试
                      </button>
                    )}
                    <button
                      onClick={() => setErrors(prev => prev.filter(e => e.id !== error.id))}
                      className="error-dismiss-button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 聊天输入框 */}
            <div className="chat-input-group">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isSending && handleSendMessage()}
                placeholder="输入问题或指令..."
                disabled={!task || isSending}
                className="chat-input-field"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !task || isSending}
                title={isSending ? "发送中..." : "发送消息"}
                className="chat-send-button"
              >
                {isSending ? (
                  <svg className="send-icon spinning" width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="send-icon" width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 右侧结果区 */}
          <div className="task-result-right">
            {/* 任务结果 */}
            {task.output && (
              <div className="info-section">
                <h2>{(() => {
                  // 组合 output 和 structuredOutput 用于获取标题
                  const resultData = task.output;
                  // 优先使用新位置 (task.structuredOutput)，兼容旧位置 (task.metadata?.structuredOutput)
                  const hasStructuredOutput = task.structuredOutput || task.metadata?.structuredOutput;
                  if (typeof resultData === 'string' && hasStructuredOutput) {
                    const combinedResult = {
                      output: resultData,
                      structuredOutput: task.structuredOutput || task.metadata?.structuredOutput,
                      metadata: task.metadata
                    };
                    return getResultTypeLabel(combinedResult);
                  }
                  return getResultTypeLabel(resultData);
                })()}</h2>
                <div className="task-result">
                  {(() => {
                    // 组合 output 和 structuredOutput
                    const resultData = task.output;
                    // 优先使用新位置 (task.structuredOutput)，兼容旧位置 (task.metadata?.structuredOutput)
                    const hasStructuredOutput = task.structuredOutput || task.metadata?.structuredOutput;
                    if (typeof resultData === 'string' && hasStructuredOutput) {
                      // 如果 output 是字符串但有 structuredOutput，创建包含两者的对象
                      const combinedResult = {
                        output: resultData,
                        structuredOutput: task.structuredOutput || task.metadata?.structuredOutput,
                        metadata: task.metadata
                      };
                      return renderResult(combinedResult);
                    }
                    return renderResult(resultData);
                  })()}
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {task.error && (
              <div className="info-section">
                <h2>错误信息</h2>
                <div className="task-error">
                  <pre>{task.error}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}

// Video Player Component
function VideoPlayer({ videoPath, duration, fps, size, getBlobUrl }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    const loadVideo = async () => {
      setLoading(true)
      setError(false)
      setDebugInfo(`开始加载视频: ${videoPath}`)

      try {
        const url = await getBlobUrl(videoPath)

        if (url) {
          setVideoUrl(url)
          setDebugInfo(`视频加载成功: ${url.substring(0, 50)}...`)
        } else {
          setError(true)
          setDebugInfo('getBlobUrl返回null')
        }
      } catch (err) {
        console.error('加载视频失败:', err)
        setError(true)
        setDebugInfo(`加载失败: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    loadVideo()
  }, [videoPath, getBlobUrl])

  if (loading) {
    return (
      <div className="media-loading">
        <div className="loading-spinner"></div>
        <p>加载视频中...</p>
        {debugInfo && <small style={{color: '#999'}}>{debugInfo}</small>}
      </div>
    )
  }

  if (error || !videoUrl) {
    return (
      <div className="media-error">
        <p>视频加载失败</p>
        <small>路径: {videoPath}</small>
        {debugInfo && <p><small>{debugInfo}</small></p>}
      </div>
    )
  }

  return (
    <>
      <video
        controls
        className="video-player"
        preload="metadata"
        controlsList="nodownload"
        onLoadedMetadata={(e) => {
          console.log('视频元数据加载完成:', e.target.duration)
        }}
        onError={(e) => {
          console.error('视频加载错误:', e)
          setError(true)
          setDebugInfo(`视频元素错误: ${e.target.error?.message || '未知错误'}`)
        }}
      >
        <source src={videoUrl} type="video/mp4" />
        您的浏览器不支持视频标签。
      </video>
      {duration && (
        <div className="media-metadata">
          <p>时长: {duration}秒</p>
          {fps && <p>帧率: {fps} FPS</p>}
          {size && <p>大小: {(size / 1024 / 1024).toFixed(2)} MB</p>}
        </div>
      )}
    </>
  )
}

// Image Player Component
function ImagePlayer({ imagePath, getBlobUrl }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      setLoading(true)
      setError(false)
      const url = await getBlobUrl(imagePath)
      if (url) {
        setImageUrl(url)
      } else {
        setError(true)
      }
      setLoading(false)
    }

    loadImage()
  }, [imagePath, getBlobUrl])

  if (loading) {
    return <div className="media-loading">加载图片...</div>
  }

  if (error || !imageUrl) {
    return <div className="media-error">图片加载失败</div>
  }

  return (
    <img
      src={imageUrl}
      alt="任务结果"
      className="image-result"
      onClick={() => window.open(imageUrl, '_blank')}
    />
  )
}

// Code Viewer Component
function CodeViewer({ codePath, getBlobUrl, language }) {
  const [code, setCode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadCode = async () => {
      setLoading(true)
      setError(false)
      try {
        const url = await getBlobUrl(codePath)
        if (url) {
          const response = await fetch(url)
          if (response.ok) {
            const codeContent = await response.text()
            setCode(codeContent)
          } else {
            setError(true)
          }
        } else {
          setError(true)
        }
      } catch (err) {
        console.error('Failed to load code:', err)
        setError(true)
      }
      setLoading(false)
    }

    loadCode()
  }, [codePath, getBlobUrl])

  if (loading) {
    return <div className="media-loading">加载代码...</div>
  }

  if (error || !code) {
    return <div className="media-error">代码加载失败</div>
  }

  return <CodePlayer code={code} language={language || 'text'} filename={codePath.split('/').pop()} />
}

export default TaskDetail
