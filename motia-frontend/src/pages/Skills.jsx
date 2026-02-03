import { useState, useEffect } from 'react'
import { skillsAPI } from '../services/api'
import './Skills.css'

function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [stats, setStats] = useState({ nativeCount: 0, claudeCount: 0, totalCount: 0 })

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const response = await skillsAPI.getSkills()
        setSkills(response.data)
        setStats({
          nativeCount: response.nativeCount || 0,
          claudeCount: response.claudeCount || 0,
          totalCount: response.count || 0
        })
      } catch (error) {
        console.error('Error fetching skills:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSkills()
  }, [])

  const filteredSkills = filter === 'all'
    ? skills
    : skills.filter(skill => skill.source === filter)

  const getSourceInfo = (source) => {
    if (source === 'claude') {
      return {
        label: 'Claude',
        className: 'claude',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
      }
    }
    return {
      label: 'Native',
      className: 'native',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    }
  }

  return (
    <div className="skills-page">
      {/* Filter Section */}
      <div className="filter-section">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Skills
            <span className="filter-count">{stats.totalCount}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'native' ? 'active' : ''}`}
            onClick={() => setFilter('native')}
          >
            Native
            <span className="filter-count">{stats.nativeCount}</span>
          </button>
          <button
            className={`filter-tab ${filter === 'claude' ? 'active' : ''}`}
            onClick={() => setFilter('claude')}
          >
            Claude Skills
            <span className="filter-count">{stats.claudeCount}</span>
          </button>
        </div>
      </div>

      {/* Skills Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading skills...</p>
        </div>
      ) : filteredSkills.length > 0 ? (
        <div className="skills-grid">
          {filteredSkills.map((skill) => {
            const sourceInfo = getSourceInfo(skill.source)
            return (
              <div
                key={skill.id || skill.name}
                className={`skill-card skill-card-${sourceInfo.className}`}
              >
                {/* Card Header */}
                <div className="skill-card-header">
                  <div className={`skill-type-badge type-${sourceInfo.className}`}>
                    {sourceInfo.icon}
                    <span>{sourceInfo.label}</span>
                  </div>
                  {skill.type && (
                    <div className="skill-execution-type">{skill.type}</div>
                  )}
                </div>

                {/* Card Content */}
                <div className="skill-card-content">
                  <h3 className="skill-title">{skill.name}</h3>
                  <p className="skill-description">
                    {skill.description || 'No description available'}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="skill-card-footer">
                  <div className="skill-meta">
                    <span className="skill-version">v{skill.version}</span>
                  </div>
                  {skill.tags && skill.tags.length > 0 && (
                    <div className="skill-tags">
                      {skill.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="skill-tag">
                          {tag}
                        </span>
                      ))}
                      {skill.tags.length > 2 && (
                        <span className="skill-tag-more">+{skill.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3>No Skills Found</h3>
          <p>{filter !== 'all' ? `No ${filter} skills available` : 'No skills configured yet'}</p>
        </div>
      )}
    </div>
  )
}

export default Skills