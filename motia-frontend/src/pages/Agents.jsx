import { useState, useEffect } from 'react'
import { agentsAPI } from '../services/api'
import './Agents.css'

function Agents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({ total: 0, active: 0, busy: 0, inactive: 0 })
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        console.log('Fetching agents...')
        const response = await agentsAPI.getAgents()
        console.log('Agents response:', response)
        setAgents(response.data)
        
        // Calculate stats
        const stats = {
          total: response.data.length,
          active: response.data.filter(a => a.status === 'active').length,
          busy: response.data.filter(a => a.status === 'busy').length,
          inactive: response.data.filter(a => a.status === 'inactive').length
        }
        setStats(stats)
        setLoading(false)
      } catch (err) {
        console.error('Error fetching agents:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    fetchAgents()
  }, [])

  const getStatusInfo = (status) => {
    const statusMap = {
      active: {
        label: 'Active',
        className: 'active',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      },
      busy: {
        label: 'Busy',
        className: 'busy',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
          </svg>
        )
      },
      inactive: {
        label: 'Offline',
        className: 'inactive',
        icon: (
          <svg style={{ width: '14px', height: '14px' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      }
    }
    return statusMap[status] || statusMap.inactive
  }

  const formatTimestamp = (dateString) => {
    if (!dateString) return 'Never'

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  }

  // Filter agents
  const filteredAgents = agents.filter(agent => {
    if (filter === 'all') return true
    return agent.status === filter
  })

  // Debug info
  console.log('Rendering Agents page, agents:', agents.length, 'loading:', loading, 'error:', error)

  if (error) {
    return (
      <div className="agents-page">
        <div className="error-state">
          <h3>Error Loading Agents</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="agents-page">
      {/* Filter Tabs */}
      <div className="filter-section">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Agents
            <span className="filter-count">{agents.length}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
            <span className="filter-count">{agents.filter(a => a.status === 'active').length}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'busy' ? 'active' : ''}`}
            onClick={() => setFilter('busy')}
          >
            Busy
            <span className="filter-count">{agents.filter(a => a.status === 'busy').length}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'inactive' ? 'active' : ''}`}
            onClick={() => setFilter('inactive')}
          >
            Offline
            <span className="filter-count">{agents.filter(a => a.status === 'inactive').length}</span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading agents...</p>
        </div>
      ) : filteredAgents.length > 0 ? (
        <div className="agents-grid">
          {filteredAgents.map((agent) => {
            const statusInfo = getStatusInfo(agent.status)
            return (
              <div key={agent.id || agent.name} className={`agent-card agent-card-${statusInfo.className}`}>
                {/* Card Header */}
                <div className="agent-card-header">
                  <div className="agent-info">
                    <div className="agent-avatar">
                      {agent.name ? agent.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                      <h3 className="agent-name">{agent.name}</h3>
                      {agent.type && (
                        <span className="agent-type-badge">{agent.type}</span>
                      )}
                    </div>
                  </div>
                  <div className={`agent-status status-${statusInfo.className}`}>
                    {statusInfo.icon}
                    <span>{statusInfo.label}</span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="agent-card-content">
                  {agent.description ? (
                    <p className="agent-description">
                      {agent.description}
                    </p>
                  ) : (
                    <p className="agent-description agent-description-empty">
                      No description available
                    </p>
                  )}

                  {/* Metrics */}
                  <div className="agent-metrics">
                    {agent.version && (
                      <div className="metric">
                        <span className="metric-label">Version</span>
                        <span className="metric-value">{agent.version}</span>
                      </div>
                    )}
                    {agent.tasksProcessed !== undefined && (
                      <div className="metric">
                        <span className="metric-label">Tasks</span>
                        <span className="metric-value">{agent.tasksProcessed}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="agent-card-footer">
                  <div className="last-seen">
                    <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Last seen: {formatTimestamp(agent.lastSeen)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <svg style={{ width: '64px', height: '64px', margin: '0 auto 1rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3>No Agents Found</h3>
          <p>No sub-agents configured yet</p>
        </div>
      )}
    </div>
  )
}

export default Agents
