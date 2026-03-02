import React, { useState, useMemo, useEffect } from 'react';
import './ArtifactsTab.css';
import CodePlayer from './CodePlayer';
import AudioPlayer from './AudioPlayer';
import VideoPlayer from './VideoPlayer';

// 使用与 API 配置相同的基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * 渲染代码内容的组件（支持 HTML 预览）
 */
const CodeContentRenderer = ({ path }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE_URL}/media?path=${encodeURIComponent(path)}`;
        console.log('[CodeContentRenderer] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        setContent(text);
        console.log('[CodeContentRenderer] Content length:', text.length);
      } catch (err) {
        console.error('[CodeContentRenderer] Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (path) {
      fetchContent();
    }
  }, [path]);

  if (loading) {
    return <div className="content-loading">加载中...</div>;
  }

  if (error) {
    return <div className="content-error">加载失败: {error}</div>;
  }

  const filename = path.split('/').pop();

  // 检测语言类型
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'json': 'json',
    'md': 'markdown',
    'xml': 'xml',
    'svg': 'xml',
  };
  const language = langMap[ext] || 'text';

  // 使用 CodePlayer 组件，它支持 HTML 预览
  return <CodePlayer code={content} language={language} filename={filename} />;
};

// 文件树节点组件
const FileTreeNode = ({ node, level = 0, onFileClick, selectedPath, expandedFolders, onToggleExpand }) => {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isFolder) {
      onToggleExpand(node.path);
    } else {
      onFileClick(node);
    }
  };

  return (
    <div>
      <div
        className={`file-tree-node ${isFolder ? 'folder' : 'file'} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {isFolder ? (
          <>
            <span className="folder-icon">
              {isExpanded ? '📂' : '📁'}
            </span>
            <span className="node-name">{node.name}</span>
            <span className="node-count">({node.children?.length || 0})</span>
          </>
        ) : (
          <>
            <span className="file-icon">📄</span>
            <span className="node-name">{node.name}</span>
          </>
        )}
      </div>
      {isFolder && isExpanded && node.children && (
        <div className="file-tree-children">
          {node.children.map((child, index) => (
            <FileTreeNode
              key={`${child.path}-${index}`}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ArtifactsTab = ({ taskId, task }) => {
  // 视图模式: 'round' (按轮次) 或 'tree' (按文件树)
  const [viewMode, setViewMode] = useState('round');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedArtifact, setSelectedArtifact] = useState(null);

  // 文件树相关状态
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));

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
      const skillName = artifact.metadata?.skill_name || 'agent';
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

  // 构建文件树结构
  const fileTree = useMemo(() => {
    const root = { name: 'root', path: 'root', type: 'folder', children: [] };

    // 过滤出有 path 的产物（所有类型，不仅仅是代码）
    const fileArtifacts = allArtifacts.filter(a => a.path && a.path.trim());

    // 处理路径的函数：将绝对路径转换为相对于项目/outputs 的路径
    const normalizePath = (fullPath) => {
      // 如果是相对路径，直接返回
      if (!fullPath.startsWith('/')) {
        return fullPath;
      }

      // 如果是绝对路径，尝试找到 outputs 目录
      const outputsIndex = fullPath.indexOf('/outputs/');
      if (outputsIndex !== -1) {
        // 返回 outputs/ 之后的部分
        return fullPath.substring(outputsIndex + 1); // +1 to keep the slash
      }

      // 如果包含 artifacts 目录
      const artifactsIndex = fullPath.indexOf('/artifacts/');
      if (artifactsIndex !== -1) {
        return fullPath.substring(artifactsIndex + 1);
      }

      // 如果都找不到，返回文件名
      const parts = fullPath.split('/');
      return parts[parts.length - 1];
    };

    fileArtifacts.forEach(artifact => {
      const normalizedPath = normalizePath(artifact.path);
      const pathParts = normalizedPath.split('/').filter(p => p);
      let currentNode = root;

      pathParts.forEach((part, index) => {
        const isFile = index === pathParts.length - 1;
        const path = pathParts.slice(0, index + 1).join('/');

        let existingChild = currentNode.children?.find(c => c.name === part);

        if (!existingChild) {
          const newNode = {
            name: part,
            path: path,
            type: isFile ? 'file' : 'folder',
            children: isFile ? undefined : [],
            artifact: isFile ? artifact : undefined
          };

          if (!currentNode.children) {
            currentNode.children = [];
          }
          currentNode.children.push(newNode);
          existingChild = newNode;

          // 按名称排序（文件夹在前，文件在后）
          currentNode.children.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'folder' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });
        }

        currentNode = existingChild;
      });
    });

    return root;
  }, [allArtifacts]);

  // 切换文件夹展开状态
  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // 处理文件点击
  const handleFileClick = (node) => {
    if (node.artifact) {
      setSelectedArtifact(node.artifact);
      setSelectedFilePath(node.path);
    }
  };

  // 根据文件路径查找对应的 artifact
  const findArtifactByPath = (path) => {
    return allArtifacts.find(a => a.path === path);
  };

  // 切换视图模式时重置选择
  const handleViewModeChange = (newMode) => {
    setViewMode(newMode);
    setSelectedRound('');
    setSelectedArtifact(null);
    setSelectedFilePath(null);
  };

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
      case 'html':
      case 'markdown':
        // 使用 CodeContentRenderer，它会使用 CodePlayer 组件
        return <CodeContentRenderer path={path} />;
      case 'image':
        // For images, use the media API, get blob URL for better control
        return (
          <div className="image-wrapper">
            <img src={`${API_BASE_URL}/media?path=${encodeURIComponent(path)}`}
                 alt={artifact.description}
                 className="artifact-image"
                 onLoad={(e) => {
                   console.log('[ArtifactsTab] Image loaded, natural size:', e.target.naturalWidth, 'x', e.target.naturalHeight);
                 }}
                 onError={(e) => {
                   console.error('[ArtifactsTab] Image load error:', e);
                   e.target.style.display = 'none';
                 }}
                 style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: '60vh', objectFit: 'contain' }}
            />
          </div>
        );
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
      {/* 控制区：视图选择 + 轮次/产物选择 */}
      <div className="artifacts-controls">
        {/* 视图模式选择 */}
        <div className="control-group">
          <label>视图:</label>
          <select
            value={viewMode}
            onChange={(e) => handleViewModeChange(e.target.value)}
            className="view-mode-selector"
          >
            <option value="round">按轮次</option>
            <option value="tree">按文件树</option>
          </select>
        </div>

        {/* 按轮次视图的控件 */}
        {viewMode === 'round' && (
          <>
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
          </>
        )}
      </div>

      {/* 文件树视图 - IDE 布局：左侧文件树 + 右侧预览 */}
      {viewMode === 'tree' && (
        <div className="ide-layout-container">
          {/* 左侧文件树 */}
          <div className="file-tree-sidebar">
            <div className="file-tree-header">
              <h3>项目文件</h3>
              <span className="file-count">
                {allArtifacts.filter(a => a.path && a.path.trim()).length} 个文件
              </span>
            </div>
            <div className="file-tree-content">
              {fileTree.children && fileTree.children.length > 0 ? (
                fileTree.children.map((node, index) => (
                  <FileTreeNode
                    key={`${node.path}-${index}`}
                    node={node}
                    onFileClick={handleFileClick}
                    selectedPath={selectedFilePath}
                    expandedFolders={expandedFolders}
                    onToggleExpand={toggleFolder}
                  />
                ))
              ) : (
                <div className="file-tree-empty">
                  <p>暂无文件产物</p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧预览区 */}
          <div className="artifact-preview">
            {selectedArtifact ? (
              <>
                <div className="artifact-info">
                  <h3>{selectedArtifact.description || '产物详情'}</h3>
                  <div className="info-grid">
                    <span>类型: <strong>{selectedArtifact.type || selectedArtifact.artifact_type}</strong></span>
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
                <p>请选择文件查看内容</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 按轮次视图的预览区 */}
      {viewMode === 'round' && (
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
      )}
    </div>
  );
};

export default ArtifactsTab;
