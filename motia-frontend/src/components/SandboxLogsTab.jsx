import React, { useState, useEffect } from 'react';
import { useMotiaStream } from '@motiadev/stream-client-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function SandboxLogsTab({ taskId }) {
  const [outputs, setOutputs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { stream } = useMotiaStream();

  // 初始获取
  useEffect(() => {
    if (!taskId) return;

    const fetchOutputs = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/contexts/${taskId}/outputs`);
        const data = await response.json();

        if (data.success) {
          setOutputs(data.data);
        } else {
          setError(data.error || '加载失败');
        }
      } catch (err) {
        console.error('[SandboxLogsTab] Failed:', err);
        setError('网络错误，请重试');
      } finally {
        setLoading(false);
      }
    };

    fetchOutputs();
  }, [taskId]);

  // 订阅任务执行状态更新
  useEffect(() => {
    if (!stream || !taskId) return;

    let subscription = null;

    try {
      // 订阅 taskExecution stream
      subscription = stream.subscribeGroup('taskExecution', taskId);

      subscription.addChangeListener((data) => {
        console.log('[SandboxLogsTab] Received task execution update:', data);

        // 重新获取 outputs
        fetch(`${API_BASE_URL}/api/contexts/${taskId}/outputs`)
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              setOutputs(result.data || []);
            }
          })
          .catch(err => console.error('[SandboxLogsTab] Failed to refresh outputs:', err));
      });

      console.log('[SandboxLogsTab] Subscribed to task execution updates');
    } catch (error) {
      console.error('[SandboxLogsTab] Failed to subscribe:', error);
    }

    return () => {
      if (subscription) {
        subscription.close();
        console.log('[SandboxLogsTab] Unsubscribed from task execution updates');
      }
    };
  }, [stream, taskId]);

  // 加载状态
  if (loading) {
    return (
      <div className="tab-loading-state">
        <svg className="spinner" viewBox="0 0 50 50">
          <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
        </svg>
        <span>加载 sandbox 日志中...</span>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="tab-error-state">
        <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{error}</span>
        <button onClick={() => window.location.reload()}>重试</button>
      </div>
    );
  }

  // 空状态
  if (outputs.length === 0) {
    return (
      <div className="tab-empty-state">
        <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span>暂无 sandbox 日志</span>
      </div>
    );
  }

  // 渲染多轮输出
  const textContent = outputs.map((round) => {
    const roundOutput = round.output || '';
    const filteredOutput = roundOutput
      .split('\n')
      .filter(line => {
        if (line.trim().startsWith('[DEBUG]')) return false;
        if (line.trim().startsWith('success=True')) return false;
        if (line.trim().startsWith('✅')) return false;
        if (line.trim().startsWith('📸')) return false;
        if (line.includes('export=') && line.length > 200) return false;
        return true;
      })
      .join('\n')
      .trim();

    const timestamp = round.timestamp ? new Date(round.timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) : '';

    const executionTime = round.executionTime
      ? `\n[执行时间]: ${round.executionTime}ms`
      : '';

    return `==================== (第 ${round.round} 轮) [${timestamp}] ====================${executionTime}\n${filteredOutput}`;
  }).join('\n\n');

  return (
    <div className="result-text-content">
      <pre className="result-text">{textContent}</pre>
    </div>
  );
}
