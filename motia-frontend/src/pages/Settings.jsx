import { useState, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import './Settings.css'

function Settings() {
  const { settings, updateSettings } = useSettings()

  // 从localStorage加载设置的初始值
  useEffect(() => {
    const savedSettings = localStorage.getItem('motia-settings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        // 设置表单的初始值，但不实际应用（因为SettingsContext已经处理了）
        setFormSettings(parsed)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
  }, [])

  const [formSettings, setFormSettings] = useState(settings)

  const handleSettingChange = (key, value) => {
    setFormSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSaveSettings = () => {
    // 更新设置并立即应用
    updateSettings(formSettings)
    alert('设置已保存并应用')
  }

  const handleResetSettings = () => {
    if (confirm('确定要重置所有设置为默认值吗？')) {
      const defaultSettings = {
        apiBaseUrl: 'http://localhost:3000',
        theme: 'light',
        language: 'zh-CN',
        autoRefresh: true,
        refreshInterval: 30,
        notifications: true,
        emailNotifications: false
      }
      setFormSettings(defaultSettings)
      updateSettings(defaultSettings)
    }
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>设置</h1>
        <p>管理系统设置</p>
      </div>

      <div className="settings-content">
        {/* 主题预览 */}
        <div className="settings-section preview-section">
          <h2>主题预览</h2>
          <div className="theme-preview">
            <div className="preview-card">
              <div className="preview-header">
                <h3>预览卡片</h3>
                <span className="preview-tag">预览标签</span>
              </div>
              <div className="preview-body">
                <p>这是示例文本，展示当前主题效果。</p>
                <button className="preview-button">按钮</button>
              </div>
            </div>
          </div>
        </div>

        {/* API 设置 */}
        <div className="settings-section">
          <h2>API 设置</h2>
          <div className="setting-item">
            <label htmlFor="apiBaseUrl">API 基础地址</label>
            <input
              id="apiBaseUrl"
              type="text"
              value={formSettings.apiBaseUrl || ''}
              onChange={(e) => handleSettingChange('apiBaseUrl', e.target.value)}
              className="setting-input"
            />
            <div className="setting-hint">
              Motia 后端 API 服务地址，默认：http://localhost:3000
            </div>
          </div>
        </div>

        {/* 主题设置 */}
        <div className="settings-section">
          <h2>主题设置</h2>
          <div className="setting-item">
            <label htmlFor="theme">主题</label>
            <select
              id="theme"
              value={formSettings.theme || 'light'}
              onChange={(e) => {
                handleSettingChange('theme', e.target.value)
                // 实时预览主题
                const newSettings = { ...formSettings, theme: e.target.value }
                updateSettings(newSettings)
              }}
              className="setting-select"
            >
              <option value="light">浅色主题</option>
              <option value="dark">深色主题</option>
              <option value="system">跟随系统</option>
            </select>
            <div className="setting-hint">
              选择主题后立即生效，无需保存
            </div>
          </div>
        </div>

        {/* 语言设置 */}
        <div className="settings-section">
          <h2>语言设置</h2>
          <div className="setting-item">
            <label htmlFor="language">语言</label>
            <select
              id="language"
              value={formSettings.language || 'zh-CN'}
              onChange={(e) => {
                handleSettingChange('language', e.target.value)
                // 实时应用语言设置
                const newSettings = { ...formSettings, language: e.target.value }
                updateSettings(newSettings)
              }}
              className="setting-select"
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
            <div className="setting-hint">
              选择语言后立即生效
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="settings-actions">
          <button
            type="button"
            className="save-button"
            onClick={handleSaveSettings}
          >
            保存设置
          </button>
          <button
            type="button"
            className="reset-button"
            onClick={handleResetSettings}
          >
            重置为默认值
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings