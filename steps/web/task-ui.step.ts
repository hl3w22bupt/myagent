/**
 * Task Web UI Step.
 *
 * Serves a modern, professional web interface for submitting tasks and viewing real-time progress.
 */

import { z as _z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Task Web UI Step configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'task-web-ui',
  description: 'Modern web UI for task submission and streaming',

  /**
   * API route configuration.
   */
  path: '/ui',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * Virtual connections.
   */
  virtualSubscribes: [],

  /**
   * Flow assignment.
   */
  flows: ['agent-workflow']
};

/**
 * Task Web UI handler.
 *
 * Returns HTML page with embedded JavaScript for real-time task monitoring.
 */
export const handler = async (request: any, { logger }: any) => {
  logger.info('Task Web UI: Serving modern page');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motia Agent Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #3B82F6;
      --primary-dark: #2563EB;
      --secondary: #64748B;
      --success: #10B981;
      --warning: #F59E0B;
      --error: #EF4444;
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --bg-tertiary: #334155;
      --text-primary: #F1F5F9;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --border: #334155;
      --glass-bg: rgba(30, 41, 59, 0.8);
      --glass-border: rgba(255, 255, 255, 0.1);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%);
      min-height: 100vh;
      color: var(--text-primary);
      line-height: 1.6;
    }

    .background-grid {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image:
        linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      position: relative;
      z-index: 1;
    }

    .header {
      text-align: center;
      margin-bottom: 3rem;
      animation: fadeInDown 0.6s ease-out;
    }

    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 50%, #93C5FD 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }

    .header p {
      color: var(--text-secondary);
      font-size: 1.1rem;
      font-weight: 400;
    }

    .card {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: fadeInUp 0.6s ease-out;
    }

    .input-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
      font-weight: 500;
      font-size: 0.9rem;
      letter-spacing: 0.01em;
    }

    textarea {
      width: 100%;
      padding: 1rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      font-size: 1rem;
      font-family: 'JetBrains Mono', monospace;
      resize: vertical;
      min-height: 120px;
      color: var(--text-primary);
      transition: all 0.2s ease;
      outline: none;
    }

    textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    textarea::placeholder {
      color: var(--text-muted);
    }

    .btn {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      border-radius: 0.75rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-family: 'Inter', sans-serif;
      letter-spacing: 0.01em;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .task-section {
      animation: fadeInUp 0.6s ease-out 0.2s backwards;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }

    .section-header h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    .task-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }

    @media (min-width: 1200px) {
      .task-list {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .task-list {
        grid-template-columns: 1fr;
      }
    }

    .task-item {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem;
      transition: all 0.2s ease;
      animation: slideIn 0.4s ease-out;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .task-item:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
    }

    .task-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .task-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-status {
      padding: 0.25rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .status-pending {
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .status-running {
      background: rgba(59, 130, 246, 0.15);
      color: var(--primary);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .status-completed {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-failed {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .task-description {
      color: var(--text-primary);
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
      line-height: 1.5;
      flex-grow: 0;
    }

    .task-step {
      color: var(--primary);
      font-size: 0.8rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .task-output {
      background: var(--bg-tertiary);
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text-primary);
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid var(--border);
      flex-grow: 1;
      margin-bottom: 0.75rem;
    }

    .task-output::-webkit-scrollbar {
      width: 8px;
    }

    .task-output::-webkit-scrollbar-track {
      background: var(--bg-secondary);
      border-radius: 4px;
    }

    .task-output::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }

    .task-output::-webkit-scrollbar-thumb:hover {
      background: var(--text-muted);
    }

    .task-metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: auto;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
      font-size: 0.7rem;
      color: var(--text-secondary);
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .metadata-time {
      font-family: 'JetBrains Mono', monospace;
      opacity: 0.8;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .info-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem;
      transition: all 0.2s ease;
    }

    .info-card:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
    }

    .info-card-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .info-card-description {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .tag {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border-radius: 0.375rem;
      font-size: 0.7rem;
      margin-right: 0.375rem;
      margin-top: 0.375rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .pagination-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.375rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: 'Inter', sans-serif;
      min-width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    }

    .pagination-btn:hover:not(:disabled) {
      background: var(--bg-tertiary);
      border-color: var(--primary);
      color: var(--text-primary);
    }

    .pagination-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .pagination-info {
      color: var(--text-muted);
      font-size: 0.7rem;
      padding: 0 0.75rem;
      font-variant-numeric: tabular-nums;
    }

    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .empty-state-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .loading-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    .status-pending .status-dot {
      background: var(--warning);
    }

    .status-running .status-dot {
      background: var(--primary);
    }

    .status-completed .status-dot {
      background: var(--success);
      animation: none;
    }

    .status-failed .status-dot {
      background: var(--error);
      animation: none;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      .header h1 {
        font-size: 1.75rem;
      }

      .card {
        padding: 1.5rem;
      }

      .task-list {
        grid-template-columns: 1fr;
      }

      .task-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .task-metadata {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="background-grid"></div>

  <div class="container">
    <div class="header">
      <h1>Motia Agent Dashboard</h1>
      <p>Intelligent task execution with real-time monitoring</p>
    </div>

    <div class="card">
      <div class="input-group">
        <label for="taskInput">Enter your task</label>
        <textarea id="taskInput" placeholder="e.g., Calculate 25*4 or What is the capital of Japan?"></textarea>
      </div>

      <button class="btn" id="submitBtn" onclick="submitTask()">
        <span>Submit Task</span>
      </button>
    </div>

    <div class="card">
      <div class="section-header">
        <h2>📊 System Overview</h2>
      </div>
      <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
          <div class="stat-value" id="statSkills">-</div>
          <div class="stat-label">Skills</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="statAgents">-</div>
          <div class="stat-label">Agents</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="statTasks">-</div>
          <div class="stat-label">Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="statSessions">-</div>
          <div class="stat-label">Sessions</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <h2>🛠️ Available Skills</h2>
      </div>
      <div class="grid-3" id="skillsGrid">
        <div class="empty-state">Loading skills...</div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <h2>🤖 Active Agents</h2>
      </div>
      <div class="grid-2" id="agentsGrid">
        <div class="empty-state">Loading agents...</div>
      </div>
    </div>

    <div class="card task-section">
      <div class="section-header">
        <h2>📋 Task History</h2>
      </div>
      <div id="taskList" class="task-list">
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p>No tasks yet. Submit a task above to get started!</p>
        </div>
      </div>
      <div id="paginationContainer"></div>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;
    let tasks = new Map();
    let systemData = null;
    let currentPage = 1;
    const tasksPerPage = 6;

    // Format timestamp to relative time (e.g., "2 minutes ago")
    function formatRelativeTime(timestamp) {
      if (!timestamp) return '';
      const now = Date.now();
      const diff = now - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return 'just now';
      if (minutes < 60) return minutes + 'm ago';
      if (hours < 24) return hours + 'h ago';
      return days + 'd ago';
    }

    // Format timestamp to absolute time (e.g., "14:30:45")
    function formatAbsoluteTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }

    // Format duration (milliseconds to human readable)
    function formatDuration(ms) {
      if (!ms) return '';
      if (ms < 1000) return ms + 'ms';
      const seconds = (ms / 1000).toFixed(1);
      return seconds + 's';
    }

    // Load system information
    async function loadSystemInfo() {
      try {
        const response = await fetch(\`\${API_BASE}/api/system\`);
        const data = await response.json();

        if (data.success) {
          systemData = data;

          // Update stats
          document.getElementById('statSkills').textContent = data.stats.totalSkills;
          document.getElementById('statAgents').textContent = data.stats.totalAgents;
          document.getElementById('statTasks').textContent = data.stats.totalTasks;
          document.getElementById('statSessions').textContent = data.stats.activeSessions;

          // Render skills
          renderSkills(data.skills);

          // Render agents
          renderAgents(data.agents);
        }
      } catch (error) {
        console.error('Error loading system info:', error);
      }
    }

    function renderSkills(skills) {
      const grid = document.getElementById('skillsGrid');

      if (!skills || skills.length === 0) {
        grid.innerHTML = '<div class="empty-state">No skills available</div>';
        return;
      }

      grid.innerHTML = skills.map(skill => \`
        <div class="info-card">
          <div class="info-card-title">
            <span>\${skill.name}</span>
          </div>
          <div class="info-card-description">\${escapeHtml(skill.description)}</div>
          <div>
            \${skill.tags.map(tag => \`<span class="tag">\${tag}</span>\`).join('')}
          </div>
        </div>
      \`).join('');
    }

    function renderAgents(agents) {
      const grid = document.getElementById('agentsGrid');

      if (!agents || agents.length === 0) {
        grid.innerHTML = '<div class="empty-state">No agents available</div>';
        return;
      }

      grid.innerHTML = agents.map(agent => \`
        <div class="info-card">
          <div class="info-card-title">
            <span>\${agent.name}</span>
            <span style="font-size: 0.7rem; opacity: 0.6;">\${agent.type}</span>
          </div>
          <div class="info-card-description">\${escapeHtml(agent.description)}</div>
          <div style="margin-top: 0.5rem;">
            <span class="tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">\${agent.status}</span>
          </div>
        </div>
      \`).join('');
    }

    async function submitTask() {
      const input = document.getElementById('taskInput');
      const task = input.value.trim();
      if (!task) return;

      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span><span>Submitting...</span>';

      try {
        const response = await fetch(\`\${API_BASE}/agent/execute\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task })
        });

        const data = await response.json();
        if (data.success) {
          input.value = '';
          addTask(data.taskId, task);
          startStreaming(data.taskId);
        }
      } catch (error) {
        console.error('Error submitting task:', error);
        alert('Failed to submit task');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Submit Task</span>';
      }
    }

    function addTask(taskId, task) {
      const now = Date.now();
      tasks.set(taskId, {
        taskId,
        task,
        status: 'pending',
        output: '',
        step: 'Initializing...',
        createdAt: now
      });
      currentPage = 1; // Go to first page to see new task
      renderTasks();
    }

    function updateTask(taskId, data) {
      const task = tasks.get(taskId);
      if (task) {
        // Add completedAt timestamp when task finishes
        if ((data.status === 'completed' || data.status === 'failed') && !task.completedAt) {
          data.completedAt = Date.now();
        }
        Object.assign(task, data);
        renderTasks();
      }
    }

    function renderTasks() {
      const list = document.getElementById('taskList');
      if (tasks.size === 0) {
        list.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <p>No tasks yet. Submit a task above to get started!</p>
          </div>
        \`;
        return;
      }

      // Sort tasks by creation time (newest first)
      const sortedTasks = Array.from(tasks.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Calculate pagination
      const totalPages = Math.ceil(sortedTasks.length / tasksPerPage);
      const startIndex = (currentPage - 1) * tasksPerPage;
      const endIndex = startIndex + tasksPerPage;
      const paginatedTasks = sortedTasks.slice(startIndex, endIndex);

      list.innerHTML = paginatedTasks.map(task => \`
        <div class="task-item">
          <div class="task-header">
            <span class="task-id">\${task.taskId}</span>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              \${task.createdAt ? \`
                <span class="metadata-time" title="Created: \${formatAbsoluteTime(task.createdAt)}">
                  🕐 \${formatRelativeTime(task.createdAt)}
                </span>
              \` : ''}
              <span class="task-status status-\${task.status}">
                <span class="status-dot"></span>
                \${task.status}
              </span>
            </div>
          </div>
          <div class="task-description">\${escapeHtml(task.task)}</div>
          \${task.step ? \`<div class="task-step">⚡ \${escapeHtml(task.step)}</div>\` : ''}
          \${task.output ? \`<div class="task-output">\${escapeHtml(task.output)}</div>\` : ''}
          <div class="task-metadata">
            \${task.createdAt ? \`
              <div class="metadata-item">
                <span>🕐</span>
                <span class="metadata-time">\${formatAbsoluteTime(task.createdAt)}</span>
              </div>
            \` : ''}
            \${task.completedAt && task.createdAt ? \`
              <div class="metadata-item">
                <span>⏱️</span>
                <span class="metadata-time">\${formatDuration(task.completedAt - task.createdAt)}</span>
              </div>
            \` : ''}
            \${task.executionTime ? \`
              <div class="metadata-item">
                <span>⚡</span>
                <span>\${formatDuration(task.executionTime)}</span>
              </div>
            \` : ''}
            \${task.metadata?.llmCalls !== undefined ? \`
              <div class="metadata-item">
                <span>🔄</span>
                <span>LLM: \${task.metadata.llmCalls}</span>
              </div>
            \` : ''}
            \${task.metadata?.skillCalls !== undefined ? \`
              <div class="metadata-item">
                <span>⚙️</span>
                <span>Skills: \${task.metadata.skillCalls}</span>
              </div>
            \` : ''}
          </div>
        </div>
      \`).join('');

      // Render pagination separately
      renderPaginationControl(totalPages);
    }

    function renderPaginationControl(totalPages) {
      const container = document.getElementById('paginationContainer');
      if (!container) return;

      if (totalPages <= 1) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = \`
        <div class="pagination">
          <button class="pagination-btn" onclick="goToPage(\${currentPage - 1})" \${currentPage === 1 ? 'disabled' : ''}>
            ‹
          </button>
          <span class="pagination-info">
            \${currentPage} / \${totalPages}
          </span>
          <button class="pagination-btn" onclick="goToPage(\${currentPage + 1})" \${currentPage === totalPages ? 'disabled' : ''}>
            ›
          </button>
        </div>
      \`;
    }

    function goToPage(page) {
      const sortedTasks = Array.from(tasks.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const totalPages = Math.ceil(sortedTasks.length / tasksPerPage);

      if (page < 1 || page > totalPages) return;

      currentPage = page;
      renderTasks();
      window.scrollTo({ top: document.querySelector('.task-section').offsetTop - 100, behavior: 'smooth' });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async function startStreaming(taskId) {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(\`\${API_BASE}/agent/results?taskId=\${taskId}\`);
          const data = await response.json();

          if (data.success && data.result) {
            const result = data.result;
            updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              output: result.output || result.error,
              executionTime: result.executionTime,
              metadata: result.metadata,
              step: result.success ? '✓ Completed' : '✗ Failed'
            });

            if (result.success || result.error) {
              clearInterval(pollInterval);
            }
          }
        } catch (error) {
          console.error('Error polling for updates:', error);
        }
      }, 1000);

      setTimeout(() => clearInterval(pollInterval), 30000);
    }

    async function loadRecentTasks() {
      try {
        const response = await fetch(\`\${API_BASE}/agent/results?limit=100\`);
        const data = await response.json();

        if (data.success && data.results) {
          data.results.forEach(result => {
            const timestamp = result.timestamp ? new Date(result.timestamp).getTime() : Date.now();
            tasks.set(result.taskId || 'legacy-' + Date.now(), {
              taskId: result.taskId,
              task: result.task,
              status: result.success ? 'completed' : 'failed',
              output: result.output || result.error,
              executionTime: result.executionTime,
              metadata: result.metadata,
              step: result.success ? '✓ Completed' : '✗ Failed',
              createdAt: timestamp,
              completedAt: timestamp + (result.executionTime || 0)
            });
          });
          renderTasks();
        }
      } catch (error) {
        console.error('Error loading recent tasks:', error);
      }
    }

    // Initialize
    loadSystemInfo();
    loadRecentTasks();

    // Update relative times every 30 seconds
    setInterval(() => {
      if (tasks.size > 0) {
        renderTasks();
      }
    }, 30000);

    document.getElementById('taskInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        submitTask();
      }
    });
  </script>
</body>
</html>
  `;

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    },
    body: html
  };
};
void _z; // Mark as unused
