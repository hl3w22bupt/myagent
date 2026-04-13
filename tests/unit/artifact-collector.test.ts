/**
 * ArtifactCollector 单元测试
 */

import { describe, it, expect } from '@jest/globals';
import { ArtifactCollector } from '../../src/core/agent/artifact-collector';
import { AgentArtifacts } from '../../src/core/agent/artifacts';
import * as fs from 'fs';
import * as path from 'path';

describe('ArtifactCollector', () => {
  describe('fromFileOperations', () => {
    it('应该将 fileOperations 转换为 AgentArtifacts', () => {
      const fileOperations = [
        {
          type: 'write',
          path: '/tmp/workspace/app.js',
          name: 'app.js',
          size: 1024,
        },
        {
          type: 'create',
          path: '/tmp/workspace/README.md',
          name: 'README.md',
          size: 512,
        },
        {
          type: 'edit',
          path: '/tmp/workspace/config.json',
          name: 'config.json',
          size: 256,
        },
      ];

      const artifacts = ArtifactCollector.fromFileOperations(
        fileOperations,
        '/tmp/workspace'
      );

      expect(artifacts).toBeDefined();
      expect(artifacts.workspace).toBe('/tmp/workspace');
      expect(artifacts.allFiles).toHaveLength(3);
      expect(artifacts.summary?.totalFiles).toBe(3);
      expect(artifacts.summary?.totalSize).toBe(1024 + 512 + 256);
    });

    it('应该正确分类文件类型', () => {
      const fileOperations = [
        { type: 'write', path: '/tmp/ws/app.js', name: 'app.js' },
        { type: 'write', path: '/tmp/ws/image.png', name: 'image.png' },
        { type: 'write', path: '/tmp/ws/video.mp4', name: 'video.mp4' },
        { type: 'write', path: '/tmp/ws/doc.pdf', name: 'doc.pdf' },
      ];

      const artifacts = ArtifactCollector.fromFileOperations(fileOperations);

      expect(artifacts.files?.codes).toHaveLength(1);
      expect(artifacts.files?.images).toHaveLength(1);
      expect(artifacts.files?.videos).toHaveLength(1);
      expect(artifacts.files?.documents).toHaveLength(1);
    });

    it('应该过滤掉非 write/create/edit 操作', () => {
      const fileOperations = [
        { type: 'write', path: '/tmp/ws/app.js', name: 'app.js' },
        { type: 'read', path: '/tmp/ws/config.json', name: 'config.json' },
        { type: 'delete', path: '/tmp/ws/old.txt', name: 'old.txt' },
      ];

      const artifacts = ArtifactCollector.fromFileOperations(fileOperations);

      expect(artifacts.allFiles).toHaveLength(1);
      expect(artifacts.allFiles?.[0].name).toBe('app.js');
    });

    it('应该计算相对路径', () => {
      const fileOperations = [
        {
          type: 'write',
          path: '/tmp/workspace/src/app.js',
          name: 'app.js',
        },
      ];

      const artifacts = ArtifactCollector.fromFileOperations(
        fileOperations,
        '/tmp/workspace'
      );

      expect(artifacts.allFiles?.[0].relativePath).toBe('src/app.js');
    });
  });

  describe('fromWorkspace', () => {
    const testWorkspace = path.join(__dirname, '../fixtures/test-workspace');

    beforeAll(() => {
      // 创建测试工作区
      if (!fs.existsSync(testWorkspace)) {
        fs.mkdirSync(testWorkspace, { recursive: true });
      }

      // 创建一些测试文件
      fs.writeFileSync(path.join(testWorkspace, 'app.js'), 'console.log("test");');
      fs.writeFileSync(path.join(testWorkspace, 'README.md'), '# Test');
      fs.mkdirSync(path.join(testWorkspace, 'src'));
      fs.writeFileSync(path.join(testWorkspace, 'src', 'utils.ts'), 'export const foo = 1;');
    });

    afterAll(() => {
      // 清理测试工作区
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    });

    it('应该扫描 workspace 并收集产物', () => {
      const artifacts = ArtifactCollector.fromWorkspace(testWorkspace);

      expect(artifacts).toBeDefined();
      expect(artifacts.workspace).toBe(testWorkspace);
      expect(artifacts.allFiles?.length).toBeGreaterThan(0);
    });

    it('应该正确分类文件', () => {
      const artifacts = ArtifactCollector.fromWorkspace(testWorkspace);

      expect(artifacts.files?.codes).toBeDefined();
      expect(artifacts.files?.codes?.length).toBeGreaterThan(0);
    });

    it('应该跳过 node_modules 和 .git', () => {
      // 创建 node_modules 目录
      const nodeModulesPath = path.join(testWorkspace, 'node_modules');
      fs.mkdirSync(nodeModulesPath, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesPath, 'index.js'), '// ignored');

      const gitPath = path.join(testWorkspace, '.git');
      fs.mkdirSync(gitPath, { recursive: true });
      fs.writeFileSync(path.join(gitPath, 'config'), '# ignored');

      const artifacts = ArtifactCollector.fromWorkspace(testWorkspace);

      // node_modules 和 .git 中的文件不应该被收集
      const hasNodeModules = artifacts.allFiles?.some(
        f => f.path.includes('node_modules')
      );
      const hasGit = artifacts.allFiles?.some(f => f.path.includes('.git'));

      expect(hasNodeModules).toBe(false);
      expect(hasGit).toBe(false);
    });

    it('应该限制扫描深度', () => {
      // 创建深层目录
      const deepPath = path.join(testWorkspace, 'level1', 'level2', 'level3', 'level4', 'level5');
      fs.mkdirSync(deepPath, { recursive: true });
      fs.writeFileSync(path.join(deepPath, 'deep.js'), '// deep file');

      // 限制深度为 3
      const artifacts = ArtifactCollector.fromWorkspace(testWorkspace, 3);

      const hasDeepFile = artifacts.allFiles?.some(f => f.path.includes('deep.js'));

      // 深度限制应该阻止扫描到 deep.js
      expect(hasDeepFile).toBe(false);
    });
  });

  describe('formatForPrompt', () => {
    it('应该格式化产物信息为自然语言', () => {
      const artifacts: AgentArtifacts = {
        workspace: '/tmp/workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/workspace/app.js',
              name: 'app.js',
              relativePath: 'app.js',
              operation: 'created',
              size: 1024,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/workspace/app.js',
            name: 'app.js',
            relativePath: 'app.js',
            operation: 'created',
            size: 1024,
          },
        ],
        summary: {
          counts: { codes: 1, images: 0, audios: 0, videos: 0, documents: 0, data: 0, other: 0 },
          totalFiles: 1,
          totalSize: 1024,
        },
      };

      const formatted = ArtifactCollector.formatForPrompt(artifacts);

      expect(formatted).toContain('Workspace: /tmp/workspace');
      expect(formatted).toContain('Files created (1)');
      expect(formatted).toContain('codes (1)');
      expect(formatted).toContain('app.js');
      expect(formatted).toContain('Summary: 1 files, 1024 bytes');
    });

    it('应该处理空产物', () => {
      const formatted = ArtifactCollector.formatForPrompt(undefined);
      expect(formatted).toBe('');
    });

    it('应该处理没有文件的产物', () => {
      const formatted = ArtifactCollector.formatForPrompt({
        workspace: '/tmp/workspace',
        allFiles: [],
      });
      expect(formatted).toBe('');
    });
  });

  describe('文件类型识别', () => {
    it('应该正确识别各种文件类型', () => {
      const testCases = [
        { file: 'app.js', expectedType: 'codes' },
        { file: 'style.css', expectedType: 'codes' },
        { file: 'README.md', expectedType: 'codes' }, // .md 在 codes 中
        { file: 'image.png', expectedType: 'images' },
        { file: 'video.mp4', expectedType: 'videos' },
        { file: 'audio.mp3', expectedType: 'audios' },
        { file: 'doc.pdf', expectedType: 'documents' },
        { file: 'data.csv', expectedType: 'data' },
      ];

      for (const { file, expectedType } of testCases) {
        const fileOperations = [
          { type: 'write', path: `/tmp/ws/${file}`, name: file },
        ];

        const artifacts = ArtifactCollector.fromFileOperations(fileOperations);

        expect(artifacts.allFiles?.[0].type).toBe(expectedType);
      }
    });

    it('应该将未知类型归类为 other', () => {
      const fileOperations = [
        { type: 'write', path: '/tmp/ws/file.unknown', name: 'file.unknown' },
      ];

      const artifacts = ArtifactCollector.fromFileOperations(fileOperations);

      expect(artifacts.allFiles?.[0].type).toBe('other');
    });
  });
});
