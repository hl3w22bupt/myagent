import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { skillsAPI } from '../services/api'
import './SkillDetail.css'

function SkillDetail() {
  const { skillName } = useParams()
  const navigate = useNavigate()
  const [skill, setSkill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchSkillDetails = async () => {
      try {
        setLoading(true)
        const response = await skillsAPI.getSkillDetails(skillName)
        setSkill(response.data)
      } catch (err) {
        console.error('Error fetching skill details:', err)
        setError('Failed to load skill details')
      } finally {
        setLoading(false)
      }
    }

    fetchSkillDetails()
  }, [skillName])

  const getSourceInfo = (source) => {
    if (source === 'claude') {
      return {
        label: 'Claude',
        className: 'claude',
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
      }
    }
    if (source === 'openclaw') {
      return {
        label: 'OpenClaw',
        className: 'openclaw',
        icon: (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        )
      }
    }
    return {
      label: 'Native',
      className: 'native',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    }
  }

  if (loading) {
    return (
      <div className="skill-detail-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading skill details...</p>
        </div>
      </div>
    )
  }

  if (error || !skill) {
    return (
      <div className="skill-detail-page">
        <div className="error-state">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3>Skill Not Found</h3>
          <p>{error || 'The requested skill could not be found'}</p>
          <button onClick={() => navigate('/skills')} className="back-button">
            Back to Skills
          </button>
        </div>
      </div>
    )
  }

  const sourceInfo = getSourceInfo(skill.source)

  return (
    <div className="skill-detail-page">
      {/* Header */}
      <div className="detail-header">
        <button onClick={() => navigate('/skills')} className="back-button">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Skills
        </button>
      </div>

      {/* Skill Info */}
      <div className="skill-detail-content">
        <div className={`skill-detail-card type-${sourceInfo.className}`}>
          {/* Card Header */}
          <div className="skill-detail-header">
            <div className={`skill-type-badge type-${sourceInfo.className}`}>
              {sourceInfo.icon}
              <span>{sourceInfo.label}</span>
            </div>
            {skill.type && (
              <div className="skill-execution-type">{skill.type}</div>
            )}
            <div className="skill-version">v{skill.version}</div>
          </div>

          {/* Title and Description */}
          <div className="skill-detail-title-section">
            <h1 className="skill-detail-name">{skill.name}</h1>
            <p className="skill-detail-description">
              {skill.description || 'No description available'}
            </p>
          </div>

          {/* Metadata */}
          <div className="skill-detail-metadata">
            <h3>Metadata</h3>
            <div className="metadata-grid">
              <div className="metadata-item">
                <span className="metadata-label">Type</span>
                <span className="metadata-value">{skill.type}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Version</span>
                <span className="metadata-value">{skill.version}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Source</span>
                <span className="metadata-value">{sourceInfo.label}</span>
              </div>
              {skill.path && (
                <div className="metadata-item">
                  <span className="metadata-label">Path</span>
                  <span className="metadata-value">{skill.path}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div className="skill-detail-tags">
              <h3>Tags</h3>
              <div className="tags-list">
                {skill.tags.map((tag) => (
                  <span key={tag} className="skill-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution Config */}
          {skill.execution && (
            <div className="skill-detail-execution">
              <h3>Execution Configuration</h3>
              <div className="execution-info">
                <div className="info-item">
                  <span className="info-label">Handler</span>
                  <span className="info-value">{skill.execution.handler}</span>
                </div>
                {skill.execution.timeout && (
                  <div className="info-item">
                    <span className="info-label">Timeout</span>
                    <span className="info-value">{skill.execution.timeout}ms</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Input Schema */}
          {skill.input_schema && (
            <div className="skill-detail-schema">
              <h3>Input Schema</h3>
              <pre className="schema-code">
                {JSON.stringify(skill.input_schema, null, 2)}
              </pre>
            </div>
          )}

          {/* Output Schema */}
          {skill.output_schema && (
            <div className="skill-detail-schema">
              <h3>Output Schema</h3>
              <pre className="schema-code">
                {JSON.stringify(skill.output_schema, null, 2)}
              </pre>
            </div>
          )}

          {/* Prompt Template */}
          {skill.prompt_template && (
            <div className="skill-detail-prompt">
              <h3>Prompt Template</h3>
              <pre className="prompt-code">
                {skill.prompt_template}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SkillDetail
