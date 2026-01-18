import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext()

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    // 从localStorage加载设置
    const savedSettings = localStorage.getItem('motia-settings')
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings)
        setSettings(parsedSettings)
        applySettings(parsedSettings)
      } catch (error) {
        console.error('Failed to parse settings:', error)
        const defaultSettings = {
          theme: 'light',
          language: 'zh-CN'
        }
        setSettings(defaultSettings)
        applySettings(defaultSettings)
      }
    } else {
      // 使用默认设置
      const defaultSettings = {
        theme: 'light',
        language: 'zh-CN'
      }
      setSettings(defaultSettings)
      applySettings(defaultSettings)
    }
  }, [])

  const updateSettings = (newSettings) => {
    setSettings(newSettings)
    localStorage.setItem('motia-settings', JSON.stringify(newSettings))
    applySettings(newSettings)
  }

  const applySettings = (settings) => {
    // 应用主题
    if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else if (settings.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }

    // 应用语言（虽然目前只有中文，但保留扩展性）
    document.documentElement.lang = settings.language === 'zh-CN' ? 'zh-CN' : 'en'
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export default SettingsProvider
