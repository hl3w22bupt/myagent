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
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    const fetchSkillDetails = async () => {
      try {
        setLoading(true)
        const response = await skillsAPI.getSkillDetails(skillName)
        if (response.data.success) {
          setSkill(response.data.data)
        } else {
          setError(response.data.message || 'Failed to load skill details')
        }
      } catch (err) {
        console.error('Error fetching skill details:', err)
        setError('Failed to load skill details')
      } finally {
        setLoading(false)
      }
    }

    fetchSkillDetails()
  }, [skillName])

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getSourceInfo = (source) => {
    if (source === 'claude') {
      return {
        label: 'Claude',
        className: 'claude',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
      }
    }
    if (source === 'openclaw') {
      return {
        label: 'OpenClaw',
        className: 'openclaw',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        )
      }
    }
    return {
      label: 'Native',
      className: 'native',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    }
  }

  if (loading) {
    return (
      <div className="skill-detail-page">
        <div className="skill-loading-state">
          <div className="skill-spinner" aria-hidden="true"></div>
          <p>Loading skill details...</p>
        </div>
      </div>
    )
  }

  if (error || !skill) {
    return (
      <div className="skill-detail-page">
        <div className="skill-error-state">
          <svg className="skill-error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3>Skill Not Found</h3>
          <p>{error || 'The requested skill could not be found'}</p>
          <button onClick={() => navigate('/skills')} className="skill-back-button">
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
      <header className="skill-detail-header">
        <button
          onClick={() => navigate('/skills')}
          className="skill-back-button"
          aria-label="Back to skills list"
        >
          <svg className="skill-back-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Skills
        </button>
      </header>

      {/* Main Content */}
      <main className="skill-detail-content">
        <div className={`skill-detail-card type-${sourceInfo.className}`}>
          {/* Card Header */}
          <div className="skill-detail-header">
            <div className={`skill-type-badge type-${sourceInfo.className}`}>
              {sourceInfo.icon}
              <span>{sourceInfo.label}</span>
            </div>
            {skill.type && (
              <span className="skill-execution-type">{skill.type}</span>
            )}
            <span className="skill-version">v{skill.version}</span>
          </div>

          {/* Title and Description */}
          <div className="skill-detail-title-section">
            <h1 className="skill-detail-name">{skill.name}</h1>
            <p className="skill-detail-description">
              {skill.description || 'No description available'}
            </p>
          </div>

          {/* Info Grid - Bento Layout */}
          <div className="skill-info-grid">
            {/* Metadata */}
            <div className="skill-info-card metadata-card">
              <h3 className="skill-info-card-title">Metadata</h3>
              <dl className="skill-metadata-list">
                <div className="skill-metadata-item">
                  <dt>Type</dt>
                  <dd>{skill.type}</dd>
                </div>
                <div className="skill-metadata-item">
                  <dt>Version</dt>
                  <dd>{skill.version}</dd>
                </div>
                <div className="skill-metadata-item">
                  <dt>Source</dt>
                  <dd>{sourceInfo.label}</dd>
                </div>
                {skill.path && (
                  <div className="skill-metadata-item">
                    <dt>Path</dt>
                    <dd className="skill-code-text">{skill.path}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Execution Config */}
            {(skill.execution || skill.metadata?.execution) && (
              <div className="skill-info-card execution-card">
                <h3 className="skill-info-card-title">Execution</h3>
                <dl className="skill-metadata-list">
                  <div className="skill-metadata-item">
                    <dt>Handler</dt>
                    <dd className="skill-code-text">
                      {skill.execution?.handler || skill.metadata?.execution?.handler}
                    </dd>
                  </div>
                  {(skill.execution?.timeout || skill.metadata?.execution?.timeout) && (
                    <div className="skill-metadata-item">
                      <dt>Timeout</dt>
                      <dd>
                        {skill.execution?.timeout || skill.metadata?.execution?.timeout}ms
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Tags */}
            {skill.tags && skill.tags.length > 0 && (
              <div className="skill-info-card tags-card">
                <h3 className="skill-info-card-title">Tags</h3>
                <div className="skill-tags-list">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="skill-detail-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Schemas and Prompt */}
          <div className="skill-code-sections">
            {/* Input Schema */}
            {(skill.input_schema || skill.metadata?.input_schema) && (
              <div className="skill-code-section">
                <div className="skill-code-header">
                  <h3>Input Schema</h3>
                  <button
                    onClick={() => copyToClipboard(
                      JSON.stringify(skill.input_schema || skill.metadata?.input_schema, null, 2),
                      'input-schema'
                    )}
                    className="skill-copy-button"
                    aria-label="Copy input schema"
                  >
                    {copied === 'input-schema' ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="skill-code-block">
                  <code>{JSON.stringify(skill.input_schema || skill.metadata?.input_schema, null, 2)}</code>
                </pre>
              </div>
            )}

            {/* Output Schema */}
            {(skill.output_schema || skill.metadata?.output_schema) && (
              <div className="skill-code-section">
                <div className="skill-code-header">
                  <h3>Output Schema</h3>
                  <button
                    onClick={() => copyToClipboard(
                      JSON.stringify(skill.output_schema || skill.metadata?.output_schema, null, 2),
                      'output-schema'
                    )}
                    className="skill-copy-button"
                    aria-label="Copy output schema"
                  >
                    {copied === 'output-schema' ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="skill-code-block">
                  <code>{JSON.stringify(skill.output_schema || skill.metadata?.output_schema, null, 2)}</code>
                </pre>
              </div>
            )}

            {/* Prompt Template */}
            {(skill.prompt_template || skill.metadata?.prompt_template) && (
              <div className="skill-code-section prompt-section">
                <div className="skill-code-header">
                  <h3>Prompt Template</h3>
                  <button
                    onClick={() => copyToClipboard(
                      skill.prompt_template || skill.metadata?.prompt_template,
                      'prompt'
                    )}
                    className="skill-copy-button"
                    aria-label="Copy prompt template"
                  >
                    {copied === 'prompt' ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="skill-code-block skill-prompt-code">
                  <code>{skill.prompt_template || skill.metadata?.prompt_template}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default SkillDetail
