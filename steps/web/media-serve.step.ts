/**
 * Media File Serve API
 *
 * Serves media files from multiple directories:
 * - videos/ (legacy video files)
 * - outputs/ (general output files)
 * - outputs/videos/ (video artifacts)
 * - outputs/codes/ (code artifacts - HTML, CSS, JS, etc.)
 * - outputs/infographics/ (infographic artifacts)
 * - outputs/audios/ (audio artifacts)
 *
 * Provides static file access for generated content with proper MIME types.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Input schema for media file requests.
 */
export const inputSchema = z
  .object({
    /**
     * File path relative to outputs/ or videos/ directory
     * Examples: "videos/task-123_video_1.mp4", "images/chart.png"
     */
    path: z.string().min(1),
  })
  .passthrough();

/**
 * Media Serve API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'media-serve-api',
  path: '/media',
  method: 'GET',
  flows: ['agent-workflow'],
  emits: [],
};

/**
 * Get MIME type based on file extension.
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    // Video types
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    // Image types
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    // Audio types
    wav: 'audio/wav',
    wave: 'audio/wav',
    mp3: 'audio/mpeg',
    mpeg: 'audio/mpeg',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    // Code/Text types - for code artifacts
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
    py: 'text/x-python',
    rb: 'text/x-ruby',
    php: 'text/x-php',
    java: 'text/x-java-source',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    hpp: 'text/x-c++',
    cs: 'text/x-csharp',
    go: 'text/x-go',
    rs: 'text/x-rust',
    sql: 'text/x-sql',
    sh: 'text/x-shellscript',
    yaml: 'text/x-yaml',
    yml: 'text/x-yaml',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Serve media file from disk.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (request: any, { logger }: any) => {
  // Motia uses queryParams not query
  const queryParams: Record<string, any> = request.queryParams || {};
  const path = queryParams.path as string;

  if (!path) {
    return {
      status: 400,
      body: {
        error: 'Missing path parameter',
      },
    };
  }

  logger.info('Media file requested', { path });

  // Normalize path: remove leading slash if present
  const normalizedPath = path.startsWith('/') ? path.substring(1) : path;

  // Build possible paths to try
  const possiblePaths: string[] = [];

  // If path already starts with 'outputs/' or 'videos/', try it directly first
  if (normalizedPath.startsWith('outputs/') || normalizedPath.startsWith('videos/')) {
    possiblePaths.push(join(process.cwd(), normalizedPath));
  }

  // Then try subdirectories for backward compatibility
  // Only add these if the path doesn't already contain the subdirectory
  if (!normalizedPath.startsWith('videos/')) {
    possiblePaths.push(join(process.cwd(), 'videos', normalizedPath));
  }
  if (!normalizedPath.startsWith('outputs/')) {
    possiblePaths.push(join(process.cwd(), 'outputs', normalizedPath));
  }
  if (!normalizedPath.includes('outputs/videos/')) {
    possiblePaths.push(join(process.cwd(), 'outputs', 'videos', normalizedPath));
  }
  if (!normalizedPath.includes('outputs/codes/')) {
    possiblePaths.push(join(process.cwd(), 'outputs', 'codes', normalizedPath));
  }
  if (!normalizedPath.includes('outputs/infographics/')) {
    possiblePaths.push(join(process.cwd(), 'outputs', 'infographics', normalizedPath));
  }
  if (!normalizedPath.includes('outputs/audios/') && !normalizedPath.includes('outputs/audio/')) {
    possiblePaths.push(join(process.cwd(), 'outputs', 'audios', normalizedPath));
    possiblePaths.push(join(process.cwd(), 'outputs', 'audio', normalizedPath));  // Legacy support
  }

  let filePathFound = '';
  for (const possiblePath of possiblePaths) {
    if (existsSync(possiblePath)) {
      filePathFound = possiblePath;
      break;
    }
  }

  if (!filePathFound) {
    logger.warn('Media file not found', { path, tried: possiblePaths });
    return {
      status: 404,
      body: {
        error: 'File not found',
        path,
      },
    };
  }

  const mimeType = getMimeType(filePathFound);
  const fileBuffer = readFileSync(filePathFound);

  logger.info('Serving media file', {
    path,
    fullPath: filePathFound,
    mimeType,
    size: fileBuffer.length,
  });

  return {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
    body: fileBuffer,
  };
};
