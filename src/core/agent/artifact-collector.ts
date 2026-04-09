/**
 * Artifact Collector
 *
 * 复用 Skill WorkspaceManager 的逻辑：
 * - 文件类型映射（ARTIFACT_TYPES）
 * - 跳过模式（SKIP_PATTERNS）
 * - 扫描和分类逻辑
 *
 * 用于将 fileOperations 或 workspace 扫描结果转换为统一的 AgentArtifacts 格式
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentArtifacts, FileArtifact, ArtifactType } from './artifacts';

/**
 * 产物收集器
 *
 * 复用 Python WorkspaceManager (src/core/skill/hooks/workspace_manager.py) 的逻辑
 */
export class ArtifactCollector {
  /** 文件类型映射（复用 WorkspaceManager.ARTIFACT_TYPES） */
  private static readonly ARTIFACT_TYPES: Record<string, string[]> = {
    videos: ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv'],
    images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
    audios: ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'],
    codes: [
      '.py', '.js', '.ts', '.jsx', '.tsx',
      '.json', '.yaml', '.yml', '.toml', '.xml',
      '.html', '.css', '.md', '.sh', '.sql',
      '.txt', '.csv', '.tsv', '.ini', '.cfg', '.conf',
      '.c', '.cpp', '.h', '.hpp', '.java', '.go', '.rs',
      '.jsx', '.vue', '.svelte',
    ],
    documents: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.odt', '.rtf'],
    data: ['.csv', '.tsv', '.sql', '.json', '.xml', '.yaml', '.yml'],
  };

  /** 跳过的文件模式（复用 WorkspaceManager.SKIP_PATTERNS） */
  private static readonly SKIP_PATTERNS = [
    '*.tmp', '*~', '.DS_Store', '__pycache__', '*.pyc',
    'node_modules', '.git', '*.log', '.gitkeep',
    '.next', '.nuxt', 'dist', 'build', 'out',
  ];

  /**
   * 根据 fileOperations 构建产物（用于 ExternalAgent）
   *
   * @param fileOperations - ExternalAgent 收集的文件操作列表
   * @param workspace - Workspace 路径
   * @returns AgentArtifacts
   */
  static fromFileOperations(
    fileOperations: any[],
    workspace?: string
  ): AgentArtifacts {
    const files: FileArtifact[] = fileOperations
      .filter(op => op.type === 'write' || op.type === 'create' || op.type === 'edit')
      .map(op => this.convertToFileArtifact(op, workspace));

    return this.classifyAndSummarize(files, workspace);
  }

  /**
   * 扫描 workspace 构建产物（用于普通 Agent）
   *
   * 复用 WorkspaceManager.scan_artifacts() 的逻辑
   *
   * @param workspace - Workspace 目录路径
   * @param maxDepth - 最大扫描深度（默认5层）
   * @returns AgentArtifacts
   */
  static fromWorkspace(workspace: string, maxDepth: number = 5): AgentArtifacts {
    if (!fs.existsSync(workspace)) {
      return { workspace };
    }

    const files: FileArtifact[] = [];

    // 递归扫描目录
    this.scanDirectory(workspace, workspace, files, 0, maxDepth);

    return this.classifyAndSummarize(files, workspace);
  }

  /**
   * 扫描目录（复用 WorkspaceManager 的逻辑）
   *
   * @param rootDir - 根目录
   * @param currentDir - 当前目录
   * @param files - 收集的文件列表
   * @param currentDepth - 当前深度
   * @param maxDepth - 最大深度
   */
  private static scanDirectory(
    rootDir: string,
    currentDir: string,
    files: FileArtifact[],
    currentDepth: number,
    maxDepth: number
  ): void {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);

        // 跳过特定模式
        if (this.shouldSkip(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          this.scanDirectory(rootDir, fullPath, files, currentDepth + 1, maxDepth);
        } else {
          // 获取文件类型
          const artifactType = this.getArtifactType(entry.name);
          if (artifactType && artifactType !== 'other') {
            try {
              const stat = fs.statSync(fullPath);
              files.push({
                type: artifactType,
                path: fullPath,
                name: entry.name,
                relativePath,
                operation: 'created',
                size: stat.size,
              });
            } catch (error) {
              // 文件可能已被删除，跳过
              console.warn(`[ArtifactCollector] Failed to stat file: ${fullPath}`, error);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[ArtifactCollector] Failed to scan directory: ${currentDir}`, error);
    }
  }

  /**
   * 判断是否应该跳过（复用 WorkspaceManager._should_skip_file）
   *
   * @param filename - 文件名
   * @returns 是否跳过
   */
  private static shouldSkip(filename: string): boolean {
    for (const pattern of this.SKIP_PATTERNS) {
      const suffix = pattern.replace('*', '');
      const prefix = pattern.replace('*', '');

      // 匹配后缀
      if (suffix && filename.endsWith(suffix)) {
        return true;
      }

      // 精确匹配
      if (filename === pattern) {
        return true;
      }

      // 匹配前缀（用于目录）
      if (prefix && filename.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取产物类型（复用 WorkspaceManager._get_artifact_type）
   *
   * 优先级：data > documents > codes > images > videos > audios
   * 这样 .csv 等文件会优先归类为 data 而不是 codes
   *
   * @param filename - 文件名
   * @returns 产物类型
   */
  private static getArtifactType(filename: string): ArtifactType | null {
    const ext = path.extname(filename).toLowerCase();

    // 按优先级顺序检查（避免 .csv 被归类为 codes）
    const typePriority: ArtifactType[] = ['data', 'documents', 'codes', 'images', 'videos', 'audios'];

    for (const type of typePriority) {
      const extensions = this.ARTIFACT_TYPES[type];
      if (extensions && extensions.includes(ext)) {
        return type;
      }
    }

    return null;
  }

  /**
   * 转换为 FileArtifact（用于 ExternalAgent）
   *
   * @param op - 文件操作对象
   * @param workspace - Workspace 路径
   * @returns FileArtifact
   */
  private static convertToFileArtifact(
    op: any,
    workspace?: string
  ): FileArtifact {
    const filePath = op.path;
    const fileName = op.name || path.basename(filePath);
    const artifactType = this.getArtifactType(fileName) || 'other';

    return {
      type: artifactType,
      path: filePath,
      name: fileName,
      relativePath: workspace ? path.relative(workspace, filePath) : undefined,
      operation: op.type === 'write' || op.type === 'create' ? 'created' : 'modified',
      size: op.size || 0,
    };
  }

  /**
   * 分类并统计产物
   *
   * @param files - 文件列表
   * @param workspace - Workspace 路径
   * @returns AgentArtifacts
   */
  private static classifyAndSummarize(
    files: FileArtifact[],
    workspace?: string
  ): AgentArtifacts {
    // 按类型分类
    const filesByType: Record<ArtifactType, FileArtifact[]> = {
      videos: [],
      images: [],
      audios: [],
      codes: [],
      documents: [],
      data: [],
      other: [],
    };

    let totalSize = 0;

    for (const file of files) {
      filesByType[file.type].push(file);
      totalSize += file.size || 0;
    }

    // 计算统计
    const counts: Record<ArtifactType, number> = {} as any;
    for (const type of Object.keys(filesByType)) {
      counts[type as ArtifactType] = filesByType[type as ArtifactType].length;
    }

    return {
      workspace,
      files: filesByType,
      allFiles: files,
      summary: {
        counts,
        totalFiles: files.length,
        totalSize,
      },
    };
  }

  /**
   * 格式化产物信息为自然语言（用于 prompt 注入）
   *
   * @param artifacts - AgentArtifacts
   * @returns 格式化的字符串
   */
  static formatForPrompt(artifacts: AgentArtifacts | undefined): string {
    if (!artifacts || !artifacts.allFiles || artifacts.allFiles.length === 0) {
      return '';
    }

    const parts: string[] = [];

    if (artifacts.workspace) {
      parts.push(`Workspace: ${artifacts.workspace}`);
    }

    parts.push(`Files created (${artifacts.allFiles.length}):`);

    // 按类型分组显示
    for (const [type, files] of Object.entries(artifacts.files || {})) {
      if (files && files.length > 0) {
        parts.push(`\n  ${type} (${files.length}):`);
        for (const file of files as FileArtifact[]) {
          parts.push(`    - ${file.relativePath || file.name}`);
        }
      }
    }

    // 添加统计信息
    if (artifacts.summary) {
      parts.push(`\nSummary: ${artifacts.summary.totalFiles} files, ${artifacts.summary.totalSize} bytes`);
    }

    return parts.join('\n');
  }
}
