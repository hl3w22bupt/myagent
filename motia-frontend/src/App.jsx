import { Routes, Route } from 'react-router-dom'
import './App.css'
import Navigation from './components/Navigation'
import ErrorBoundary from './components/ErrorBoundary'
import Home from './pages/Home'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Submit from './pages/Submit'
import Skills from './pages/Skills'
import SkillDetail from './pages/SkillDetail'
import Agents from './pages/Agents'
import AutonomousAgents from './pages/AutonomousAgents'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import { SettingsProvider } from './contexts/SettingsContext'
import { MotiaStreamProvider } from '@motiadev/stream-client-react'

function App() {
  const streamUrl = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace('http', 'ws')
    : 'ws://localhost:3000'

  return (
    <ErrorBoundary>
      <MotiaStreamProvider address={streamUrl}>
        <SettingsProvider>
          <div className="app">
            <Navigation />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/tasks/:id" element={<TaskDetail />} />
                <Route path="/submit" element={<Submit />} />
                <Route path="/skills" element={<Skills />} />
                <Route path="/skills/:skillName" element={<SkillDetail />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/autonomous-agents" element={<AutonomousAgents />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </SettingsProvider>
      </MotiaStreamProvider>
    </ErrorBoundary>
  )
}

export default App
