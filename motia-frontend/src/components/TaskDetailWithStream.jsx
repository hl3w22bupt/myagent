/**
 * TaskDetail Component with Real-time Stream Updates
 *
 * 使用 taskResult Stream 实现实时更新任务详情页
 *
 * 核心特性：
 * 1. 使用 taskId 订阅特定任务的结果
 * 2. 数据格式与 /agent/result API 完全一致
 * 3. 无需轮询，零延迟更新
 * 4. 自动处理 artifacts、metadata 等
 */

import { useState, useEffect, useRef } from 'react';
import { useStream } from '@/contexts/StreamContext';

export default function TaskDetailWithStream({ taskId }) {
  const stream = useStream();
  const [taskData, setTaskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    if (!stream || !taskId) return;

    console.log('[TaskDetail] 开始订阅 taskResult stream', { taskId });

    // ========== 1. 订阅 taskResult Stream ==========
    // 使用 taskId 订阅特定任务的结果
    try {
      subscriptionRef.current = stream.subscribeGroup('taskResult', taskId);

      // 监听流式更新
      subscriptionRef.current.addChangeListener((data) => {
        console.log('[TaskDetail] ✅ 收到任务结果更新:', data);

        // ✨ 直接使用 stream 数据，格式与 API 完全相同
        setTaskData(data);
        setLoading(false);
      });

      console.log('[✅ TaskDetail] taskResult stream 订阅成功');
    } catch (error) {
      console.error('[❌ TaskDetail] taskResult stream 订阅失败:', error);
    }

    // ========== 2. 清理订阅 ==========
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.removeAllListeners();
        console.log('[TaskDetail] 清理 taskResult stream 订阅');
      }
    };
  }, [taskId]);

  // ========== 渲染逻辑 ==========
  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (!taskData) {
    return <div className="error">任务未找到</div>;
  }

  return (
    <div className="task-detail">
      {/* 任务基本信息 */}
      <div className="task-header">
        <h1>{taskData.task}</h1>
        <StatusBadge status={taskData.status} />
      </div>

      {/* 任务输出 */}
      {taskData.output && (
        <div className="task-output">
          <h2>输出</h2>
          <pre>{taskData.output}</pre>
        </div>
      )}

      {/* Artifacts 展示 */}
      {taskData.artifacts && taskData.artifacts.length > 0 && (
        <div className="task-artifacts">
          <h2>生成的文件 ({taskData.artifacts.length})</h2>
          <ArtifactList artifacts={taskData.artifacts} />
        </div>
      )}

      {/* 执行信息 */}
      <div className="task-metadata">
        <h2>执行信息</h2>
        <MetadataDisplay metadata={taskData.metadata} />
      </div>
    </div>
  );
}

// ========== 子组件 ==========

function StatusBadge({ status }) {
  const statusConfig = {
    completed: { label: '已完成', color: 'green' },
    failed: { label: '失败', color: 'red' },
    running: { label: '执行中', color: 'blue' },
    pending: { label: '等待中', color: 'gray' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`status-badge status-${config.color}`}>
      {config.label}
    </span>
  );
}

function ArtifactList({ artifacts }) {
  return (
    <div className="artifact-list">
      {artifacts.map((artifact) => (
        <ArtifactCard key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}

function ArtifactCard({ artifact }) {
  const renderArtifact = () => {
    switch (artifact.type) {
      case 'video':
        return (
          <video controls>
            <source src={artifact.path} type="video/mp4" />
          </video>
        );

      case 'image':
      case 'infographic':
        return <img src={artifact.path} alt={artifact.description} />;

      case 'code':
        return (
          <CodeBlock
            path={artifact.path}
            description={artifact.description}
          />
        );

      case 'table':
        return <TableDisplay path={artifact.path} />;

      default:
        return <a href={artifact.path}>下载文件</a>;
    }
  };

  return (
    <div className="artifact-card">
      <div className="artifact-header">
        <span className="artifact-type">{artifact.type}</span>
        <span className="artifact-action">{artifact.action}</span>
      </div>
      <div className="artifact-content">
        {renderArtifact()}
      </div>
      {artifact.description && (
        <p className="artifact-description">{artifact.description}</p>
      )}
      <span className="artifact-timestamp">
        {new Date(artifact.timestamp).toLocaleString()}
      </span>
    </div>
  );
}

function CodeBlock({ path, description }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(path)
      .then(res => res.text())
      .then(setCode)
      .finally(() => setLoading(false));
  }, [path]);

  if (loading) return <div>加载代码中...</div>;

  return (
    <div className="code-block">
      <pre><code>{code}</code></pre>
    </div>
  );
}

function MetadataDisplay({ metadata }) {
  if (!metadata) return null;

  return (
    <div className="metadata-grid">
      {metadata.llmCalls && (
        <div className="metadata-item">
          <span>LLM 调用次数:</span>
          <strong>{metadata.llmCalls}</strong>
        </div>
      )}
      {metadata.skillCalls && (
        <div className="metadata-item">
          <span>Skill 调用次数:</span>
          <strong>{metadata.skillCalls}</strong>
        </div>
      )}
      {metadata.totalTokens && (
        <div className="metadata-item">
          <span>总 Token 数:</span>
          <strong>{metadata.totalTokens}</strong>
        </div>
      )}
      {metadata.skillNames && (
        <div className="metadata-item">
          <span>使用的 Skills:</span>
          <div className="skill-tags">
            {metadata.skillNames.map(name => (
              <span key={name} className="skill-tag">{name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
