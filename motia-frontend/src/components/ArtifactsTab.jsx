import React, { useState, useMemo } from 'react';
import './ArtifactsTab.css';
import CodePlayer from './CodePlayer';
import AudioPlayer from './AudioPlayer';
import VideoPlayer from './VideoPlayer';

// 使用与 API 配置相同的基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const ArtifactsTab = ({ taskId, task }) => {
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedArtifact, setSelectedArtifact] = useState(null);

  // 获取所有产物
  const allArtifacts = task?.artifacts || [];

  // 缓存 blob URLs
  const blobUrlCache = useMemo(() => new Map(), []);

  // 获取媒体文件的 blob URL（从 TaskDetail.jsx 复制）
  const getMediaBlobUrl = async (path) => {
    if (!path) return null;

    // Check cache first
    if (blobUrlCache.has(path)) {
      console.log('[ArtifactsTab] Using cached URL for:', path);
      return blobUrlCache.get(path);
    }

    console.log('[ArtifactsTab] Fetching media for:', path);

    try {
      const url = `${API_BASE_URL}/media?path=${encodeURIComponent(path)}`;
      console.log('[ArtifactsTab] Fetching:', url);

      const response = await fetch(url);
      console.log('[ArtifactsTab] Response status:', response.status);

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      console.log('[ArtifactsTab] Blob size:', blob.size, 'type:', blob.type);

      const blobUrl = URL.createObjectURL(blob);
      console.log('[ArtifactsTab] Created blob URL:', blobUrl, 'for path:', path);

      // Cache the URL
      blobUrlCache.set(path, blobUrl);

      return blobUrl;
    } catch (error) {
      console.error('[ArtifactsTab] Error fetching media file:', error);
      return null;
    }
  };

  // 按对话轮次分组产物
  const { roundsMap, roundKeys, roundsInfo } = useMemo(() => {
    const map = {};
    const info = {};

    console.log('[ArtifactsTab] All artifacts:', allArtifacts);

    allArtifacts.forEach(artifact => {
      // 从 metadata 获取 conversation_round，默认为 0
      // 确保 round 是数字类型
      let round = artifact.metadata?.conversation_round ?? 0;
      round = Number(round); // 转换为数字
      console.log('[ArtifactsTab] Artifact:', artifact.id, 'round:', round, 'metadata:', artifact.metadata);

      if (!map[round]) {
        map[round] = [];
      }
      map[round].push(artifact);

      // 统计每轮的 skill 调用
      const skillName = artifact.metadata?.skill_name || 'unknown';
      if (!info[round]) {
        info[round] = { skills: new Set(), count: 0 };
      }
      info[round].skills.add(skillName);
      info[round].count++;
    });

    const keys = Object.keys(map).map(Number).sort((a, b) => a - b);

    return {
      roundsMap: map,
      roundKeys: keys,
      roundsInfo: info
    };
  }, [allArtifacts]);

  // 当前选中轮次的产物
  const currentRoundArtifacts = selectedRound !== ''
    ? roundsMap[selectedRound]
    : [];

  // 产物渲染函数
  const renderArtifact = (artifact) => {
    const type = artifact.type || artifact.artifact_type;
    const path = artifact.path;

    switch (type) {
      case 'video':
        return <VideoPlayer videoPath={path} getBlobUrl={getMediaBlobUrl} />;
      case 'audio':
        return <AudioPlayer audioPath={path} getBlobUrl={getMediaBlobUrl} filename={path.split('/').pop()} />;
      case 'code':
        // CodePlayer 需要 code 内容，不是路径
        return <div className="text-artifact">代码文件: {path}</div>;
      case 'image':
        // For images, use the media API
        return <img src={`${API_BASE_URL}/media?path=${encodeURIComponent(path)}`}
                     alt={artifact.description}
                     style={{ maxWidth: '100%', borderRadius: '8px' }}
                     onError={(e) => { e.target.style.display = 'none'; console.error('Image load error:', e); }} />;
      default:
        return <div className="text-artifact">{artifact.description || path}</div>;
    }
  };

  // 获取产物显示名称
  const getArtifactLabel = (artifact) => {
    const skillName = artifact.metadata?.skill_name || 'Skill';
    const type = artifact.type || artifact.artifact_type || 'file';
    const desc = artifact.description ? `: ${artifact.description}` : '';
    return `${skillName} (${type})${desc}`;
  };

  return (
    <div className="artifacts-tab">
      {/* 控制区：轮次和产物选择 */}
      <div className="artifacts-controls">
        {/* 轮次选择 */}
        <div className="control-group">
          <label>对话轮次:</label>
          <select
            value={selectedRound}
            onChange={(e) => {
              setSelectedRound(e.target.value);
              setSelectedArtifact(null);
            }}
          >
            <option value="">-- 选择轮次 --</option>
            {roundKeys.map(round => {
              const info = roundsInfo[round];
              const skillList = Array.from(info.skills).join(' → ');
              return (
                <option key={round} value={round}>
                  第 {parseInt(round) + 1} 轮 ({info.count} 个产物: {skillList})
                </option>
              );
            })}
          </select>
        </div>

        {/* 产物选择 */}
        {selectedRound && (
          <div className="control-group">
            <label>选择产物:</label>
            <select
              value={selectedArtifact?.id ?? ''}
              onChange={(e) => {
                const found = currentRoundArtifacts.find(a => a.id === e.target.value);
                setSelectedArtifact(found);
              }}
            >
              <option value="">-- 选择产物 --</option>
              {currentRoundArtifacts.map(artifact => (
                <option key={artifact.id} value={artifact.id}>
                  {getArtifactLabel(artifact)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 预览区 */}
      <div className="artifact-preview">
        {selectedArtifact ? (
          <>
            <div className="artifact-info">
              <h3>{selectedArtifact.description || '产物详情'}</h3>
              <div className="info-grid">
                <span>类型: <strong>{selectedArtifact.type || selectedArtifact.artifact_type}</strong></span>
                <span>轮次: <strong>第 {parseInt(selectedRound) + 1} 轮</strong></span>
              </div>
              <div className="path-info">
                <span>路径: <code>{selectedArtifact.path}</code></span>
              </div>
            </div>
            <div className="artifact-content">
              {renderArtifact(selectedArtifact)}
            </div>
          </>
        ) : (
          <div className="artifact-placeholder">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>请选择对话轮次和产物查看</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsTab;
