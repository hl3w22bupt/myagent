/**
 * 统一的 Agent 产物类型定义
 *
 * 复用 Skill WorkspaceManager 的分类逻辑：
 * - videos: .mp4, .mov, .avi, .webm, .mkv, .flv
 * - images: .png, .jpg, .jpeg, .gif, .svg, .webp, .bmp
 * - audios: .mp3, .wav, .aac, .m4a, .ogg, .flac
 * - codes: .py, .js, .ts, .jsx, .tsx, .json, .yaml, .md, etc.
 * - documents: .pdf, .doc, .docx, .ppt, .pptx
 * - data: .csv, .tsv, .sql
 */

/**
 * 产物类型（复用 WorkspaceManager.ARTIFACT_TYPES）
 */
export type ArtifactType = 'videos' | 'images' | 'audios' | 'codes' | 'documents' | 'data' | 'other';

/**
 * 文件产物信息
 */
export interface FileArtifact {
  /** 产物类型 */
  type: ArtifactType;

  /** 文件路径（绝对路径） */
  path: string;

  /** 文件名 */
  name: string;

  /** 相对于 workspace 的路径 */
  relativePath?: string;

  /** 操作类型 */
  operation: 'created' | 'modified' | 'read' | 'deleted';

  /** 文件大小（字节） */
  size?: number;

  /** 描述 */
  description?: string;
}

/**
 * Agent 产物（统一接口）
 *
 * 设计原则：
 * 1. 复用 Skill WorkspaceManager 的分类逻辑
 * 2. 提供按类型分组的访问方式（类似 WorkspaceManager 返回格式）
 * 3. 提供扁平列表方便遍历
 * 4. 包含统计信息用于快速查看
 */
export interface AgentArtifacts {
  /** Workspace 路径 */
  workspace?: string;

  /** 文件产物列表（按类型分类，类似 WorkspaceManager） */
  files?: {
    [K in ArtifactType]?: FileArtifact[];
  };

  /** 所有文件的扁平列表（方便遍历） */
  allFiles?: FileArtifact[];

  /** 统计信息（类似 WorkspaceManager 的返回格式） */
  summary?: {
    /** 每种类型的文件数 */
    counts: Record<ArtifactType, number>;
    /** 总文件数 */
    totalFiles: number;
    /** 总大小（字节） */
    totalSize: number;
  };
}

/**
 * 从 AgentResult 提取产物的辅助函数
 */
export function extractArtifacts(result: any): AgentArtifacts | undefined {
  // 优先使用 artifacts 字段
  if (result.artifacts) {
    return result.artifacts;
  }

  // 向后兼容：从 metadata.fileOperations 转换
  if (result.metadata?.fileOperations) {
    // 这个转换逻辑在 ArtifactCollector 中实现
    // 这里只是类型声明
    return undefined;
  }

  return undefined;
}
