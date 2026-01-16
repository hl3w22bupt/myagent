import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { skillsAPI } from '../services/api'
import './Skills.css'

function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const response = await skillsAPI.getSkills()
        setSkills(response.data)
      } catch (error) {
        console.error('Error fetching skills:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSkills()
  }, [])

  return (
    <div className="skills">
      <div className="skills-header">
        <h1>技能管理</h1>
        <p>管理系统中的技能</p>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : skills.length > 0 ? (
        <div className="skills-content">
          <div className="skills-grid">
            {skills.map(skill => (
              <div key={skill.id || skill.name} className="skill-card">
                <div className="skill-header">
                  <div className="skill-icon">
                    🔧
                  </div>
                  <div className="skill-info">
                    <h3 className="skill-name">{skill.name}</h3>
                    {skill.category && (
                      <span className="skill-category">{skill.category}</span>
                    )}
                  </div>
                </div>
                <div className="skill-description">
                  {skill.description || '暂无描述'}
                </div>
                <div className="skill-meta">
                  {skill.version && (
                    <span className="skill-version">版本: {skill.version}</span>
                  )}
                </div>
                {skill.id && (
                  <div className="skill-actions">
                    <Link to={`/skills/${skill.id}`} className="detail-link">
                      查看详情
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="no-skills">
          暂无技能
        </div>
      )}
    </div>
  )
}

export default Skills