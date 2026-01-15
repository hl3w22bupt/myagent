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
  flows: ['agent-workflow'],
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

    .task-skills {
      margin-bottom: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 0.5rem;
    }

    .task-skills-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--primary);
      cursor: pointer;
      user-select: none;
    }

    .task-skills-header:hover {
      color: var(--primary-dark);
    }

    .task-skills-header .expand-icon {
      transition: transform 0.2s ease;
      font-size: 0.65rem;
    }

    .task-skills-header.expanded .expand-icon {
      transform: rotate(90deg);
    }

    .task-skills-list {
      display: none;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .task-skills-list.show {
      display: flex;
    }

    .skill-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      background: var(--bg-tertiary);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 0.375rem;
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
    }

    .skill-badge:hover {
      background: rgba(59, 130, 246, 0.15);
      border-color: var(--primary);
    }

    .no-skills {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-style: italic;
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

    /* ========================================
       RESULT RENDERER STYLES
       ======================================== */

    /* Result Container */
    .result-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .result-title {
      margin-bottom: 1rem;
    }

    .result-title h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .result-description {
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: rgba(59, 130, 246, 0.08);
      border-left: 3px solid var(--primary);
      border-radius: 0.375rem;
    }

    .result-description p {
      margin: 0;
      color: var(--text-primary);
      line-height: 1.6;
    }

    /* Text Renderer */
    .text-content {
      margin-bottom: 1rem;
    }

    .text-display {
      background: var(--bg-tertiary);
      padding: 1rem;
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      line-height: 1.6;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text-primary);
      max-height: 400px;
      overflow-y: auto;
    }

    /* Table Renderer */
    .table-controls {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .table-search {
      flex: 1;
      min-width: 200px;
      padding: 0.625rem 0.875rem;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      color: var(--text-primary);
      font-size: 0.875rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .table-search:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .table-export-btn {
      padding: 0.625rem 1rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .table-export-btn:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }

    .table-content {
      margin-bottom: 1rem;
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .data-table thead {
      background: var(--bg-tertiary);
    }

    .data-table th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 2px solid var(--border);
      cursor: pointer;
      user-select: none;
      transition: background 0.2s ease;
    }

    .data-table th:hover {
      background: rgba(59, 130, 246, 0.1);
    }

    .data-table th.sortable {
      position: relative;
    }

    .sort-indicator {
      margin-left: 0.5rem;
      opacity: 0.5;
      font-size: 0.75rem;
    }

    .data-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      color: var(--text-secondary);
    }

    .data-table tbody tr:last-child td {
      border-bottom: none;
    }

    .data-table tbody tr:hover {
      background: rgba(59, 130, 246, 0.05);
    }

    .table-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }

    .row-count {
      color: var(--text-secondary);
    }

    /* Infographic Renderer */
    .infographic-container {
      margin-bottom: 1rem;
    }

    .infographic-controls {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .fullscreen-btn,
    .download-btn {
      padding: 0.5rem 0.875rem;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .fullscreen-btn:hover,
    .download-btn:hover {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .infographic-wrapper {
      background: var(--bg-tertiary);
      padding: 1rem;
      border-radius: 0.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .infographic-image {
      max-width: 100%;
      height: auto;
      border-radius: 0.375rem;
    }

    .file-metadata {
      display: flex;
      gap: 1rem;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }

    .file-size,
    .file-type {
      color: var(--text-secondary);
    }

    /* Fullscreen Modal */
    .fullscreen-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .fullscreen-content {
      position: relative;
      max-width: 100%;
      max-height: 100%;
    }

    .fullscreen-close {
      position: absolute;
      top: -2.5rem;
      right: 0;
      background: transparent;
      border: none;
      color: white;
      font-size: 2rem;
      cursor: pointer;
      padding: 0.5rem;
      line-height: 1;
      transition: transform 0.2s ease;
    }

    .fullscreen-close:hover {
      transform: scale(1.1);
    }

    .fullscreen-image {
      max-width: 100%;
      max-height: calc(100vh - 4rem);
      object-fit: contain;
    }

    /* Video Renderer */
    .video-container {
      margin-bottom: 1rem;
    }

    .video-player {
      width: 100%;
      border-radius: 0.5rem;
      background: var(--bg-tertiary);
    }

    .video-metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
    }

    .video-metadata-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .video-metadata-item .metadata-label {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .video-metadata-item .metadata-value {
      color: var(--text-primary);
      font-weight: 600;
    }

    .video-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Report Renderer */
    .report-summary {
      margin-bottom: 1rem;
      padding: 1rem;
      background: rgba(16, 185, 129, 0.08);
      border-left: 3px solid var(--success);
      border-radius: 0.375rem;
    }

    .report-summary p {
      margin: 0;
      color: var(--text-primary);
      line-height: 1.6;
    }

    .report-type-badge {
      margin-bottom: 1rem;
    }

    .report-type-badge .badge {
      display: inline-block;
      padding: 0.375rem 0.75rem;
      background: var(--primary);
      color: white;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .report-sections {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .report-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .report-section:hover {
      border-color: var(--primary);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      cursor: pointer;
      user-select: none;
    }

    .section-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .section-toggle {
      font-size: 0.75rem;
      color: var(--text-secondary);
      transition: transform 0.2s ease;
    }

    .section-content {
      padding: 1rem;
      border-top: 1px solid var(--border);
    }

    /* Score Display */
    .score-display {
      display: flex;
      justify-content: center;
      padding: 1.5rem;
    }

    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
    }

    .score-excellent .score-circle {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    }

    .score-good .score-circle {
      background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
    }

    .score-fair .score-circle {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
    }

    .score-poor .score-circle {
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
    }

    .score-value {
      font-size: 2rem;
    }

    /* Issues List */
    .issues-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .issue-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
      border-left: 3px solid var(--error);
    }

    .issue-number {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--error);
      color: white;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .issue-content {
      flex: 1;
    }

    .issue-message {
      margin: 0 0 0.375rem 0;
      color: var(--text-primary);
      font-size: 0.875rem;
    }

    .issue-severity {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .severity-high {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
    }

    .severity-medium {
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
    }

    .severity-low {
      background: rgba(59, 130, 246, 0.15);
      color: var(--primary);
    }

    .issue-location {
      margin: 0.375rem 0 0 0;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Suggestions List */
    .suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .suggestion-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
    }

    .suggestion-bullet {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .suggestion-text {
      margin: 0;
      color: var(--text-primary);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .metric-item {
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .metric-label {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .metric-value {
      color: var(--text-primary);
      font-weight: 600;
    }

    /* Generic Data List */
    .generic-data-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .generic-data-item {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
    }

    .data-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--primary);
    }

    .data-value {
      margin: 0;
      padding: 0.5rem;
      background: var(--bg-tertiary);
      border-radius: 0.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      overflow-x: auto;
    }

    /* Error Renderer */
    .error-container {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }

    .error-icon {
      flex-shrink: 0;
      font-size: 2rem;
    }

    .error-content {
      flex: 1;
    }

    .error-title {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--error);
    }

    .error-code {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      background: var(--error);
      color: white;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
    }

    .error-message {
      margin: 0;
      color: var(--text-primary);
      font-size: 0.875rem;
    }

    .error-suggestions {
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
    }

    .suggestions-title {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .error-suggestions .suggestions-list {
      margin: 0;
      padding-left: 1.25rem;
    }

    .error-suggestions .suggestion-item {
      margin-bottom: 0.375rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .error-actions {
      display: flex;
      gap: 0.75rem;
    }

    .retry-btn {
      padding: 0.625rem 1rem;
      background: var(--warning);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .retry-btn:hover {
      background: #D97706;
      transform: translateY(-1px);
    }

    .copy-error-btn {
      padding: 0.625rem 1rem;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .copy-error-btn:hover {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .copy-error-btn.copied {
      background: var(--success);
      color: white;
      border-color: var(--success);
    }

    /* Result Metadata */
    .result-metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }

    .result-metadata .metadata-item {
      display: flex;
      gap: 0.375rem;
    }

    .result-metadata .metadata-label {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .result-metadata .metadata-value {
      color: var(--text-primary);
      font-weight: 600;
    }

    /* Unknown Result Type */
    .unknown-type {
      border-color: var(--warning);
    }

    .unknown-result {
      padding: 1rem;
      background: rgba(245, 158, 11, 0.08);
      border-radius: 0.5rem;
    }

    .unknown-message {
      margin: 0 0 0.75rem 0;
      color: var(--warning);
      font-weight: 600;
      font-size: 0.875rem;
    }

    .unknown-data {
      margin: 0;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      overflow-x: auto;
      color: var(--text-secondary);
    }

    /* Render Error */
    .render-error {
      border-color: var(--error);
    }

    .render-error-content {
      padding: 1rem;
      background: rgba(239, 68, 68, 0.08);
      border-radius: 0.5rem;
    }

    .render-error-content h4 {
      margin: 0 0 0.5rem 0;
      color: var(--error);
      font-size: 1rem;
    }

    .render-error-content .error-message {
      margin-bottom: 0.75rem;
      color: var(--text-primary);
      font-size: 0.875rem;
    }

    .render-error-content details {
      margin-top: 0.75rem;
    }

    .render-error-content summary {
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .render-error-content pre {
      margin: 0.75rem 0 0 0;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: 0.375rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      overflow-x: auto;
      color: var(--text-secondary);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .table-controls {
        flex-direction: column;
      }

      .table-search {
        min-width: 100%;
      }

      .infographic-controls {
        flex-direction: column;
      }

      .video-metadata {
        grid-template-columns: 1fr;
      }

      .file-metadata {
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
    // Base Renderer
    class BaseResultRenderer {
      constructor(result) {
        this.result = result;
        this.element = null;
      }

      render() {
        throw new Error('render() must be implemented by subclass');
      }

      getFileUrl(path) {
        return \`/outputs/\${path}\`;
      }

      formatFileSize(bytes) {
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
          size /= 1024;
          unitIndex++;
        }
        return \`\${size.toFixed(1)} \${units[unitIndex]}\`;
      }

      formatDuration(seconds) {
        if (!seconds) return '';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? \`\${mins}m \${secs}s\` : \`\${secs}s\`;
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      createContainer() {
        const container = document.createElement('div');
        container.className = 'result-container';
        return container;
      }

      createMetadata() {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'result-metadata';
        const metadata = this.result.metadata || {};
        const entries = Object.entries(metadata);
        if (entries.length === 0) {
          metaDiv.style.display = 'none';
          return metaDiv;
        }
        entries.forEach(([key, value]) => {
          const item = document.createElement('div');
          item.className = 'metadata-item';
          item.innerHTML = \`
            <span class="metadata-label">\${this.escapeHtml(key)}:</span>
            <span class="metadata-value">\${this.escapeHtml(String(value))}</span>
          \`;
          metaDiv.appendChild(item);
        });
        return metaDiv;
      }
    }

    // Text Renderer
    class TextRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { text, title } = this.result.content;

        let html = '';

        if (title) {
          html += \`
            <div class="result-title">
              <h3>\${this.escapeHtml(title)}</h3>
            </div>
          \`;
        }

        html += \`
          <div class="text-content">
            <pre class="text-display">\${this.escapeHtml(text)}</pre>
          </div>
        \`;

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;
        return container;
      }
    }

    // Table Renderer
    class TableRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { type, title, columns, rows } = this.result.content;

        let html = '';

        if (title) {
          html += \`
            <div class="result-title">
              <h3>\${this.escapeHtml(title)}</h3>
            </div>
          \`;
        }

        html += \`
          <div class="table-controls">
            <input
              type="text"
              class="table-search"
              placeholder="Search table..."
              data-table-id="\${this.getTableId()}"
            />
            <button class="table-export-btn" data-table-id="\${this.getTableId()}">
              Export CSV
            </button>
          </div>
        \`;

        html += \`
          <div class="table-content">
            <table class="data-table" id="\${this.getTableId()}">
              <thead>
                <tr>
                  \${columns.map((col, index) => \`
                    <th class="sortable" data-column="\${index}">
                      \${this.escapeHtml(col)}
                      <span class="sort-indicator">↕</span>
                    </th>
                  \`).join('')}
                </tr>
              </thead>
              <tbody>
                \${rows.map((row, rowIndex) => \`
                  <tr data-row="\${rowIndex}">
                    \${row.map((cell, cellIndex) => \`
                      <td data-column="\${cellIndex}">\${this.escapeHtml(String(cell))}</td>
                    \`).join('')}
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;

        html += \`
          <div class="table-info">
            <span class="row-count">\${rows.length} rows</span>
          </div>
        \`;

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;

        setTimeout(() => this.attachEventHandlers(), 0);
        return container;
      }

      getTableId() {
        return \`table-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;
      }

      attachEventHandlers() {
        const table = document.getElementById(this.getTableId());
        if (!table) return;

        table.querySelectorAll('th.sortable').forEach(th => {
          th.addEventListener('click', () => {
            const column = parseInt(th.dataset.column);
            this.sortTable(column, th);
          });
        });

        const searchInput = document.querySelector(\`.table-search[data-table-id="\${this.getTableId()}"]\`);
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            this.searchTable(e.target.value);
          });
        }

        const exportBtn = document.querySelector(\`.table-export-btn[data-table-id="\${this.getTableId()}"]\`);
        if (exportBtn) {
          exportBtn.addEventListener('click', () => {
            this.exportCSV();
          });
        }
      }

      sortTable(columnIndex, headerElement) {
        const table = document.getElementById(this.getTableId());
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        const currentSort = headerElement.dataset.sort || 'none';
        const newSort = currentSort === 'asc' ? 'desc' : 'asc';
        headerElement.dataset.sort = newSort;

        table.querySelectorAll('th.sortable').forEach(th => {
          th.querySelector('.sort-indicator').textContent = '↕';
        });
        headerElement.querySelector('.sort-indicator').textContent = newSort === 'asc' ? '↑' : '↓';

        rows.sort((a, b) => {
          const aCell = a.querySelector(\`td[data-column="\${columnIndex}"]\`).textContent;
          const bCell = b.querySelector(\`td[data-column="\${columnIndex}"]\`).textContent;

          const comparison = aCell.localeCompare(bCell, undefined, { numeric: true });
          return newSort === 'asc' ? comparison : -comparison;
        });

        rows.forEach(row => tbody.appendChild(row));
      }

      searchTable(query) {
        const table = document.getElementById(this.getTableId());
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const lowerQuery = query.toLowerCase();

        let visibleCount = 0;

        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          const isVisible = text.includes(lowerQuery);
          row.style.display = isVisible ? '' : 'none';
          if (isVisible) visibleCount++;
        });

        const rowCountSpan = table.parentElement.parentElement.querySelector('.row-count');
        if (rowCountSpan) {
          rowCountSpan.textContent = \`\${visibleCount} of \${rows.length} rows\`;
        }
      }

      exportCSV() {
        const { columns, rows } = this.result.content;

        const csvLines = [
          columns.map(col => this.escapeCSV(col)).join(','),
          ...rows.map(row =>
            row.map(cell => this.escapeCSV(String(cell))).join(',')
          )
        ];

        const csvContent = csvLines.join('\\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = \`table-\${Date.now()}.csv\`;
        link.click();

        URL.revokeObjectURL(url);
      }

      escapeCSV(text) {
        if (text.includes(',') || text.includes('"') || text.includes('\\n')) {
          return \`"\${text.replace(/"/g, '""')}"\`;
        }
        return text;
      }
    }

    // Infographic Renderer
    class InfographicRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { path, mime_type, size, title, description } = this.result.content;

        let html = '';

        if (title) {
          html += \`
            <div class="result-title">
              <h3>\${this.escapeHtml(title)}</h3>
            </div>
          \`;
        }

        if (description) {
          html += \`
            <div class="result-description">
              <p>\${this.escapeHtml(description)}</p>
            </div>
          \`;
        }

        html += \`
          <div class="infographic-container">
            <div class="infographic-controls">
              <button class="fullscreen-btn" data-image-url="\${this.getFileUrl(path)}" title="View Fullscreen">
                <span>⛶</span> Fullscreen
              </button>
              <button class="download-btn" data-image-url="\${this.getFileUrl(path)}" data-filename="\${this.getFilename(path)}" title="Download">
                <span>⬇</span> Download
              </button>
            </div>
            <div class="infographic-wrapper">
              <img
                src="\${this.getFileUrl(path)}"
                alt="\${this.escapeHtml(title || 'Infographic')}"
                class="infographic-image"
                data-mime-type="\${mime_type}"
              />
            </div>
          </div>
        \`;

        html += \`
          <div class="file-metadata">
            \${size ? \`<span class="file-size">\${this.formatFileSize(size)}</span>\` : ''}
            <span class="file-type">\${mime_type}</span>
          </div>
        \`;

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;

        setTimeout(() => this.attachEventHandlers(), 0);
        return container;
      }

      getFilename(path) {
        return path.split('/').pop();
      }

      attachEventHandlers() {
        const fullscreenBtn = this.element.querySelector('.fullscreen-btn');
        if (fullscreenBtn) {
          fullscreenBtn.addEventListener('click', () => {
            this.openFullscreen();
          });
        }

        const downloadBtn = this.element.querySelector('.download-btn');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', () => {
            this.downloadImage();
          });
        }

        const image = this.element.querySelector('.infographic-image');
        if (image) {
          image.addEventListener('click', () => {
            this.openFullscreen();
          });
          image.style.cursor = 'pointer';
        }
      }

      openFullscreen() {
        const image = this.element.querySelector('.infographic-image');
        if (!image) return;

        const modal = document.createElement('div');
        modal.className = 'fullscreen-modal';
        modal.innerHTML = \`
          <div class="fullscreen-content">
            <button class="fullscreen-close">&times;</button>
            <img src="\${image.src}" alt="\${image.alt}" class="fullscreen-image" />
          </div>
        \`;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        const closeBtn = modal.querySelector('.fullscreen-close');
        closeBtn.addEventListener('click', () => {
          this.closeFullscreen(modal);
        });

        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeFullscreen(modal);
          }
        });

        const escapeHandler = (e) => {
          if (e.key === 'Escape') {
            this.closeFullscreen(modal);
            document.removeEventListener('keydown', escapeHandler);
          }
        };
        document.addEventListener('keydown', escapeHandler);
      }

      closeFullscreen(modal) {
        modal.remove();
        document.body.style.overflow = '';
      }

      downloadImage() {
        const { path, mime_type } = this.result.content;
        const url = this.getFileUrl(path);
        const filename = this.getFilename(path);

        fetch(url)
          .then(response => response.blob())
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(blobUrl);
          })
          .catch(error => {
            console.error('Failed to download image:', error);
            window.open(url, '_blank');
          });
      }
    }

    // Video Renderer
    class VideoRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { path, mime_type, size, duration, fps, resolution } = this.result.content;

        let html = '';

        html += \`
          <div class="video-container">
            <video
              src="\${this.getFileUrl(path)}"
              controls
              class="video-player"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        \`;

        const metadataItems = [];

        if (duration) {
          metadataItems.push(\`
            <div class="video-metadata-item">
              <span class="metadata-label">Duration:</span>
              <span class="metadata-value">\${this.formatDuration(duration)}</span>
            </div>
          \`);
        }

        if (resolution) {
          metadataItems.push(\`
            <div class="video-metadata-item">
              <span class="metadata-label">Resolution:</span>
              <span class="metadata-value">\${this.escapeHtml(resolution)}</span>
            </div>
          \`);
        }

        if (fps) {
          metadataItems.push(\`
            <div class="video-metadata-item">
              <span class="metadata-label">Frame Rate:</span>
              <span class="metadata-value">\${fps} FPS</span>
            </div>
          \`);
        }

        if (size) {
          metadataItems.push(\`
            <div class="video-metadata-item">
              <span class="metadata-label">File Size:</span>
              <span class="metadata-value">\${this.formatFileSize(size)}</span>
            </div>
          \`);
        }

        metadataItems.push(\`
          <div class="video-metadata-item">
            <span class="metadata-label">Format:</span>
            <span class="metadata-value">\${this.escapeHtml(mime_type)}</span>
          </div>
        \`);

        if (metadataItems.length > 0) {
          html += \`
            <div class="video-metadata">
              \${metadataItems.join('')}
            </div>
          \`;
        }

        html += \`
          <div class="video-actions">
            <button class="download-btn" data-video-url="\${this.getFileUrl(path)}" data-filename="\${this.getFilename(path)}">
              <span>⬇</span> Download Video
            </button>
          </div>
        \`;

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;

        setTimeout(() => this.attachEventHandlers(), 0);
        return container;
      }

      getFilename(path) {
        return path.split('/').pop();
      }

      attachEventHandlers() {
        const downloadBtn = this.element.querySelector('.download-btn');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', () => {
            this.downloadVideo();
          });
        }
      }

      downloadVideo() {
        const { path } = this.result.content;
        const url = this.getFileUrl(path);
        const filename = this.getFilename(path);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      }
    }

    // Report Renderer
    class ReportRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { type, title, summary, data } = this.result.content;

        let html = '';

        if (title) {
          html += \`
            <div class="result-title">
              <h3>\${this.escapeHtml(title)}</h3>
            </div>
          \`;
        }

        if (summary) {
          html += \`
            <div class="report-summary">
              <p>\${this.escapeHtml(summary)}</p>
            </div>
          \`;
        }

        html += \`
          <div class="report-type-badge">
            <span class="badge">\${this.escapeHtml(type)}</span>
          </div>
        \`;

        const sections = this.generateSections(data);
        if (sections.length > 0) {
          html += \`
            <div class="report-sections">
              \${sections.join('')}
            </div>
          \`;
        }

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;

        setTimeout(() => this.attachEventHandlers(), 0);
        return container;
      }

      generateSections(data) {
        const sections = [];

        if (data.score !== undefined) {
          sections.push(this.createScoreSection(data.score));
        }

        if (data.issues && data.issues.length > 0) {
          sections.push(this.createIssuesSection(data.issues));
        }

        if (data.suggestions && data.suggestions.length > 0) {
          sections.push(this.createSuggestionsSection(data.suggestions));
        }

        if (data.metrics && Object.keys(data.metrics).length > 0) {
          sections.push(this.createMetricsSection(data.metrics));
        }

        const otherData = this.filterKnownFields(data);
        if (Object.keys(otherData).length > 0) {
          sections.push(this.createGenericSection(otherData));
        }

        return sections;
      }

      filterKnownFields(data) {
        const knownFields = ['score', 'issues', 'suggestions', 'metrics', 'type', 'title', 'summary'];
        const filtered = {};

        for (const [key, value] of Object.entries(data)) {
          if (!knownFields.includes(key)) {
            filtered[key] = value;
          }
        }

        return filtered;
      }

      createScoreSection(score) {
        const scoreNum = parseFloat(score);
        const percentage = Math.round(scoreNum * 100);
        const colorClass = this.getScoreColorClass(scoreNum);

        return \`
          <div class="report-section collapsed">
            <div class="section-header">
              <h4 class="section-title">Overall Score</h4>
              <span class="section-toggle">▶</span>
            </div>
            <div class="section-content" style="display: none;">
              <div class="score-display \${colorClass}">
                <div class="score-circle">
                  <span class="score-value">\${percentage}%</span>
                </div>
              </div>
            </div>
          </div>
        \`;
      }

      getScoreColorClass(score) {
        if (score >= 0.8) return 'score-excellent';
        if (score >= 0.6) return 'score-good';
        if (score >= 0.4) return 'score-fair';
        return 'score-poor';
      }

      createIssuesSection(issues) {
        const items = issues.map((issue, index) => \`
          <div class="issue-item">
            <span class="issue-number">\${index + 1}</span>
            <div class="issue-content">
              <p class="issue-message">\${this.escapeHtml(issue.message || issue)}</p>
              \${issue.severity ? \`<span class="issue-severity severity-\${issue.severity}">\${issue.severity}</span>\` : ''}
              \${issue.location ? \`<p class="issue-location">📍 \${this.escapeHtml(issue.location)}</p>\` : ''}
            </div>
          </div>
        \`).join('');

        return \`
          <div class="report-section collapsed">
            <div class="section-header">
              <h4 class="section-title">Issues (\${issues.length})</h4>
              <span class="section-toggle">▶</span>
            </div>
            <div class="section-content" style="display: none;">
              <div class="issues-list">
                \${items}
              </div>
            </div>
          </div>
        \`;
      }

      createSuggestionsSection(suggestions) {
        const items = suggestions.map((suggestion, index) => \`
          <div class="suggestion-item">
            <span class="suggestion-bullet">💡</span>
            <p class="suggestion-text">\${this.escapeHtml(suggestion.text || suggestion)}</p>
          </div>
        \`).join('');

        return \`
          <div class="report-section collapsed">
            <div class="section-header">
              <h4 class="section-title">Suggestions (\${suggestions.length})</h4>
              <span class="section-toggle">▶</span>
            </div>
            <div class="section-content" style="display: none;">
              <div class="suggestions-list">
                \${items}
              </div>
            </div>
          </div>
        \`;
      }

      createMetricsSection(metrics) {
        const items = Object.entries(metrics).map(([key, value]) => \`
          <div class="metric-item">
            <span class="metric-label">\${this.escapeHtml(key)}:</span>
            <span class="metric-value">\${this.escapeHtml(String(value))}</span>
          </div>
        \`).join('');

        return \`
          <div class="report-section collapsed">
            <div class="section-header">
              <h4 class="section-title">Metrics</h4>
              <span class="section-toggle">▶</span>
            </div>
            <div class="section-content" style="display: none;">
              <div class="metrics-grid">
                \${items}
              </div>
            </div>
          </div>
        \`;
      }

      createGenericSection(data) {
        const items = Object.entries(data).map(([key, value]) => {
          const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
          return \`
            <div class="generic-data-item">
              <span class="data-label">\${this.escapeHtml(key)}:</span>
              <pre class="data-value">\${this.escapeHtml(displayValue)}</pre>
            </div>
          \`;
        }).join('');

        return \`
          <div class="report-section collapsed">
            <div class="section-header">
              <h4 class="section-title">Additional Data</h4>
              <span class="section-toggle">▶</span>
            </div>
            <div class="section-content" style="display: none;">
              <div class="generic-data-list">
                \${items}
              </div>
            </div>
          </div>
        \`;
      }

      attachEventHandlers() {
        const sections = this.element.querySelectorAll('.report-section');
        sections.forEach(section => {
          const header = section.querySelector('.section-header');
          const toggle = section.querySelector('.section-toggle');
          const content = section.querySelector('.section-content');

          header.addEventListener('click', () => {
            const isCollapsed = section.classList.contains('collapsed');

            if (isCollapsed) {
              section.classList.remove('collapsed');
              section.classList.add('expanded');
              toggle.textContent = '▼';
              content.style.display = '';
            } else {
              section.classList.remove('expanded');
              section.classList.add('collapsed');
              toggle.textContent = '▶';
              content.style.display = 'none';
            }
          });
        });
      }
    }

    // Error Renderer
    class ErrorRenderer extends BaseResultRenderer {
      render() {
        const container = this.createContainer();
        const { error, code, suggestions } = this.result.content;

        let html = '';

        html += \`
          <div class="error-container">
            <div class="error-icon">⚠️</div>
            <div class="error-content">
              <h4 class="error-title">Error</h4>
              \${code ? \`<span class="error-code">\${this.escapeHtml(code)}</span>\` : ''}
              <p class="error-message">\${this.escapeHtml(error)}</p>
            </div>
          </div>
        \`;

        if (suggestions && suggestions.length > 0) {
          html += \`
            <div class="error-suggestions">
              <h5 class="suggestions-title">Suggestions:</h5>
              <ul class="suggestions-list">
                \${suggestions.map(suggestion => \`
                  <li class="suggestion-item">\${this.escapeHtml(suggestion)}</li>
                \`).join('')}
              </ul>
            </div>
          \`;
        }

        html += \`
          <div class="error-actions">
            <button class="retry-btn" onclick="window.location.reload()">
              <span>🔄</span> Retry
            </button>
            <button class="copy-error-btn" data-error="\${this.escapeHtml(error).replace(/"/g, '&quot;')}">
              <span>📋</span> Copy Error
            </button>
          </div>
        \`;

        html += this.createMetadata().outerHTML;
        container.innerHTML = html;

        setTimeout(() => this.attachEventHandlers(), 0);
        return container;
      }

      attachEventHandlers() {
        const copyBtn = this.element.querySelector('.copy-error-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            this.copyError();
          });
        }
      }

      copyError() {
        const { error, code } = this.result.content;
        const errorText = code ? \`[\${code}] \${error}\` : error;

        navigator.clipboard.writeText(errorText).then(() => {
          const copyBtn = this.element.querySelector('.copy-error-btn');
          const originalText = copyBtn.innerHTML;

          copyBtn.innerHTML = '<span>✓</span> Copied!';
          copyBtn.classList.add('copied');

          setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy error:', err);
        });
      }
    }

    // Result Renderer Registry
    class ResultRendererRegistry {
      constructor() {
        this.renderers = new Map();
        this.fallbackRenderer = null;
      }

      register(resultType, RendererClass) {
        if (typeof RendererClass !== 'function') {
          throw new Error(\`Renderer for "\${resultType}" must be a class constructor\`);
        }
        this.renderers.set(resultType, RendererClass);
      }

      registerFallback(RendererClass) {
        if (typeof RendererClass !== 'function') {
          throw new Error('Fallback renderer must be a class constructor');
        }
        this.fallbackRenderer = RendererClass;
      }

      getRenderer(result) {
        const resultType = result.result_type || result.type;

        if (!resultType) {
          console.warn('Result missing result_type field, using fallback');
          return this.fallbackRenderer ? new this.fallbackRenderer(result) : null;
        }

        const RendererClass = this.renderers.get(resultType);

        if (!RendererClass) {
          console.warn(\`No renderer registered for type "\${resultType}", using fallback\`);
          return this.fallbackRenderer ? new this.fallbackRenderer(result) : null;
        }

        return new RendererClass(result);
      }

      render(result) {
        const renderer = this.getRenderer(result);

        if (!renderer) {
          console.error('No renderer available for result:', result);
          return this.createFallbackElement(result);
        }

        try {
          return renderer.render();
        } catch (error) {
          console.error('Renderer error:', error);
          return this.createErrorElement(result, error);
        }
      }

      createFallbackElement(result) {
        const div = document.createElement('div');
        div.className = 'result-container unknown-type';
        div.innerHTML = \`
          <div class="unknown-result">
            <p class="unknown-message">Unknown result type: \${this.escapeHtml(result.result_type || 'unknown')}</p>
            <pre class="unknown-data">\${this.escapeHtml(JSON.stringify(result, null, 2))}</pre>
          </div>
        \`;
        return div;
      }

      createErrorElement(result, error) {
        const div = document.createElement('div');
        div.className = 'result-container render-error';
        div.innerHTML = \`
          <div class="render-error-content">
            <h4>Rendering Error</h4>
            <p class="error-message">\${this.escapeHtml(error.message)}</p>
            <details>
              <summary>Result Data</summary>
              <pre>\${this.escapeHtml(JSON.stringify(result, null, 2))}</pre>
            </details>
          </div>
        \`;
        return div;
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    }

    // Initialize registry
    const resultRegistry = new ResultRendererRegistry();
    resultRegistry.register('text', TextRenderer);
    resultRegistry.register('table', TableRenderer);
    resultRegistry.register('infographic', InfographicRenderer);
    resultRegistry.register('video', VideoRenderer);
    resultRegistry.register('report', ReportRenderer);
    resultRegistry.register('error', ErrorRenderer);
    resultRegistry.registerFallback(ErrorRenderer);

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

        // Store the result object if it has result_type
        if (data.result && data.result.result_type) {
          data.result = data.result;
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

      list.innerHTML = paginatedTasks.map(task => {
        // Prepare result object for renderer
        let resultContent = '';

        // Try to use result registry if task has structured output
        if (task.result && task.result.result_type) {
          try {
            const renderedResult = resultRegistry.render(task.result);
            if (renderedResult) {
              resultContent = renderedResult.outerHTML;
            }
          } catch (error) {
            console.error('Error rendering result:', error);
            resultContent = \`<div class="task-output">\${escapeHtml(task.output || '')}</div>\`;
          }
        } else if (task.output) {
          // Fallback to plain text output
          resultContent = \`<div class="task-output">\${escapeHtml(task.output)}</div>\`;
        }

        return \`
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
            \${resultContent}
            \${task.metadata?.skillNames && task.metadata.skillNames.length > 0 ? \`
              <div class="task-skills">
                <div class="task-skills-header" onclick="toggleSkills('\${task.taskId}')">
                  <span class="expand-icon">▶</span>
                  <span>⚙️ Used Skills (\${task.metadata.skillNames.length})</span>
                </div>
                <div class="task-skills-list" id="skills-\${task.taskId}">
                  \${task.metadata.skillNames.map(skill => \`<span class="skill-badge">\${escapeHtml(skill)}</span>\`).join('')}
                </div>
              </div>
            \` : ''}
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
        \`;
      }).join('');

      // Re-attach event handlers for dynamic renderers after DOM update
      setTimeout(() => {
        paginatedTasks.forEach(task => {
          if (task.result && task.result.result_type) {
            // Attach handlers for tables, infographics, videos, etc.
            const renderer = resultRegistry.getRenderer(task.result);
            if (renderer && renderer.attachEventHandlers && renderer.element) {
              renderer.attachEventHandlers();
            }
          }
        });
      }, 0);

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

    function toggleSkills(taskId) {
      const skillsList = document.getElementById(\`skills-\${taskId}\`);
      const header = skillsList.previousElementSibling;

      if (skillsList.classList.contains('show')) {
        skillsList.classList.remove('show');
        header.classList.remove('expanded');
      } else {
        skillsList.classList.add('show');
        header.classList.add('expanded');
      }
    }

    async function startStreaming(taskId) {
      let pollInterval = 2000; // Start with 2 seconds
      const maxInterval = 10000; // Max 10 seconds
      let currentAttempts = 0;
      const maxFastAttempts = 5; // Use fast polling for first 5 attempts (10 seconds total)

      const poll = async () => {
        try {
          const response = await fetch(\`\${API_BASE}/agent/result?id=\${taskId}\`);
          const data = await response.json();

          if (data.success && data.result) {
            const result = data.result;

            // Check if result uses new unified format
            const isUnifiedFormat = result.result && result.result.result_type;

            updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              output: result.output || result.error,
              executionTime: result.executionTime,
              metadata: result.metadata,
              result: isUnifiedFormat ? result.result : undefined,
              step: result.success ? '✓ Completed' : '✗ Failed'
            });

            if (result.success || result.error) {
              return; // Stop polling
            }
          }

          currentAttempts++;

          // Exponential backoff: increase interval after fast attempts
          if (currentAttempts > maxFastAttempts && pollInterval < maxInterval) {
            pollInterval = Math.min(pollInterval * 1.5, maxInterval);
          }

          setTimeout(poll, pollInterval);
        } catch (error) {
          console.error('Error polling for updates:', error);
          setTimeout(poll, pollInterval);
        }
      };

      poll();

      // Safety timeout: stop after 5 minutes
      setTimeout(() => {
        // Timeout handled by poll function
      }, 300000);
    }

    async function loadRecentTasks() {
      try {
        const response = await fetch(\`\${API_BASE}/agent/results?limit=100\`);
        const data = await response.json();

        if (data.success && data.results) {
          data.results.forEach(result => {
            const timestamp = result.timestamp ? new Date(result.timestamp).getTime() : Date.now();

            // Check if result uses new unified format
            const isUnifiedFormat = result.result && result.result.result_type;

            tasks.set(result.taskId || 'legacy-' + Date.now(), {
              taskId: result.taskId,
              task: result.task,
              status: result.success ? 'completed' : 'failed',
              output: result.output || result.error,
              executionTime: result.executionTime,
              metadata: result.metadata,
              result: isUnifiedFormat ? result.result : undefined,
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
      'Content-Type': 'text/html; charset=utf-8',
    },
    body: html,
  };
};
void _z; // Mark as unused
