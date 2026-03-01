/**
 * Artifact提取器
 *
 * 从消息中提取Artifact信息，用于跟踪文件修改、函数调用等
 */

import type { ArtifactIndex } from '../database/context-types';

export class ArtifactExtractor {
  /**
   * 从消息中提取Artifacts
   */
  extractFromMessage(message: { content: string; metadata?: { skillCalls?: string[] } }): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 1. 提取文件路径
    const fileArtifacts = this.extractFiles(message.content);
    artifacts.push(...fileArtifacts);

    // 2. 提取函数名
    const functionArtifacts = this.extractFunctions(message.content);
    artifacts.push(...functionArtifacts);

    // 3. 从metadata中的skillCalls提取
    if (message.metadata?.skillCalls) {
      for (const skill of message.metadata.skillCalls) {
        artifacts.push({
          id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          artifactType: 'function',
          action: 'read',
          path: skill,
          description: `调用了skill: ${skill}`,
          timestamp: new Date(),
        });
      }
    }

    return artifacts;
  }

  /**
   * 提取文件路径
   * 匹配模式: /path/to/file.ext 或 ./path/to/file.ext
   */
  private extractFiles(content: string): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 正则匹配文件路径
    const filePathPattern = /([/.][^\s,]+\.[a-z]{2,4})/gi;
    const matches = content.match(filePathPattern);

    if (matches) {
      // 检测动作类型
      const action = this.detectAction(content);

      for (const path of matches) {
        artifacts.push({
          id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          artifactType: 'file',
          action,
          path,
          description: this.generateDescription(content, path),
          timestamp: new Date(),
        });
      }
    }

    return artifacts;
  }

  /**
   * 提取函数名
   * 匹配模式: functionName() 或 function_name
   */
  private extractFunctions(content: string): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 正则匹配函数调用
    const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const matches = content.matchAll(functionPattern);

    for (const match of matches) {
      const funcName = match[1];

      // 过滤常见JavaScript关键词
      if (['if', 'for', 'while', 'switch', 'catch'].includes(funcName)) {
        continue;
      }

      artifacts.push({
        id: `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        artifactType: 'function',
        action: 'read',
        path: funcName,
        description: `函数调用: ${funcName}`,
        timestamp: new Date(),
      });
    }

    return artifacts;
  }

  /**
   * 检测动作类型
   */
  private detectAction(content: string): 'created' | 'modified' | 'read' | 'deleted' {
    const lower = content.toLowerCase();

    if (lower.includes('创建') || lower.includes('新建') || lower.includes('created')) {
      return 'created';
    }
    if (lower.includes('删除') || lower.includes('移除') || lower.includes('deleted')) {
      return 'deleted';
    }
    if (lower.includes('修改') || lower.includes('更新') || lower.includes('modified')) {
      return 'modified';
    }

    return 'read';
  }

  /**
   * 生成描述
   */
  private generateDescription(content: string, path: string): string {
    // 查找文件附近的描述性文字
    const sentences = content.split(/[。！？.!?]/);
    for (const sentence of sentences) {
      if (sentence.includes(path)) {
        return sentence.trim();
      }
    }

    return `操作文件: ${path}`;
  }
}
