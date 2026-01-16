import { useState, useEffect } from 'react'
import { agentsAPI } from '../services/api'
import './Agents.css'

function Agents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await agentsAPI.getAgents()
        setAgents(response.data)
      } catch (error) {
        console.error('Error fetching agents:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAgents()
  }, [])

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'status-active'
      case 'inactive':
        return 'status-inactive'
      case 'busy':
        return 'status-busy'
      default:
        return 'status-unknown'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return '活跃'
      case 'inactive':
        return '离线'
      case 'busy':
        return '忙碌'
      default:
        return '未知'
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="agents">
      <div className="agents-header">
        <h1>子代理管理</h1>
        <p>管理系统中的子代理</p>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : agents.length > 0 ? (
        <div className="agents-content">
          <div className="agents-grid">
            {agents.map(agent => (
              <div key={agent.id || agent.name} className="agent-card">
                <div className="agent-header">
                  <div className="agent-info">
                    <h3 className="agent-name">{agent.name}</h3>
                    {agent.type && (
                      <span className="agent-type">{agent.type}</span>
                    )}
                  </div>
                  <span className={`status ${getStatusColor(agent.status)}`}>
                    {getStatusText(agent.status)}
                  </span>
                </div>
                <div className="agent-details">
                  {agent.description && (
                    <div className="agent-description">
                      {agent.description}
                    </div>
                  )}
                  <div className="agent-meta">
                    {agent.version && (
                      <div className="meta-item">
                        <span className="meta-label">版本:</span>
                        <span className="meta-value">{agent.version}</span>
                      </div>
                    )}
                    {agent.lastSeen && (
                      <div className="meta-item">
                        <span className="meta-label">最后活跃:</span>
                        <span className="meta-value">{formatDate(agent.lastSeen)}</span>
                      </div>
                    )}
                    {agent.tasksProcessed !== undefined && (
                      <div className="meta-item">
                        <span className="meta-label">处理任务:</span>
                        <span className="meta-value">{agent.tasksProcessed}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="no-agents">
          暂无子代理
        </div>
      )}
    </div>
  )
}

export default Agents