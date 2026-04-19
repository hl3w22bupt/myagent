#!/usr/bin/env node

/**
 * Media & Outputs File Server (Zero dependencies - Node.js native http)
 *
 * Routes:
 *   GET /media?path=<relative-path>  — frontend-compatible media endpoint
 *   GET /outputs/<path>              — direct outputs access
 *   GET /health                      — health check
 *
 * Port: 3010 (configurable via MEDIA_PORT env var)
 */

const http = require('http');
const { join, extname } = require('path');
const { existsSync, readFileSync, statSync } = require('fs');
const { URL } = require('url');

const PORT = process.env.MEDIA_PORT || 3010;

// MIME type mapping
const mimeTypes = {
  // Video types
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  // Image types
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  // Audio types
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  // Code/Text types
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.java': 'text/x-java-source',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.sql': 'text/x-sql',
  '.sh': 'text/x-shellscript',
  '.yaml': 'text/x-yaml',
  '.yml': 'text/x-yaml',
  // Document types
  '.pdf': 'application/pdf',
};

function getMimeType(filepath) {
  const ext = extname(filepath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Build list of possible file paths to search for a given relative path.
 * Mirrors the logic in media-serve.step.ts for backward compatibility.
 */
function resolveMediaPath(path) {
  const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
  const possiblePaths = [];

  // If path starts with /, try as absolute path first
  if (path.startsWith('/')) {
    possiblePaths.push(path);
  }

  // If path already starts with outputs/ or videos/, try relative to cwd
  if (normalizedPath.startsWith('outputs/') || normalizedPath.startsWith('videos/')) {
    possiblePaths.push(join(process.cwd(), normalizedPath));
  }

  // Try subdirectories for backward compatibility
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
    possiblePaths.push(join(process.cwd(), 'outputs', 'audio', normalizedPath));
  }

  return possiblePaths;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function serveFile(res, filePath, rangeHeader) {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const mimeType = getMimeType(filePath);

  // Handle Range requests for video seeking
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const fileBuffer = readFileSync(filePath);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(fileBuffer.slice(start, end + 1));
    return;
  }

  // Full file response
  const fileBuffer = readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': fileSize.toString(),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': 'bytes',
  });
  res.end(fileBuffer);
}

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // Health check
    if (pathname === '/health') {
      sendJson(res, 200, { status: 'ok', port: PORT, service: 'media-server' });
      return;
    }

    // Media serve route: /media?path=xxx
    if (pathname === '/media') {
      const path = parsedUrl.searchParams.get('path');
      if (!path) {
        sendJson(res, 400, { error: 'Missing path parameter' });
        return;
      }

      const possiblePaths = resolveMediaPath(path);
      for (const p of possiblePaths) {
        if (existsSync(p)) {
          serveFile(res, p, req.headers.range);
          return;
        }
      }

      sendJson(res, 404, { error: 'File not found', path });
      return;
    }

    // Direct outputs access: /outputs/<path>
    if (pathname.startsWith('/outputs/')) {
      const filePath = pathname.replace(/^\/outputs\//, '');
      const absolutePath = join(process.cwd(), 'outputs', filePath);

      if (!existsSync(absolutePath)) {
        sendJson(res, 404, { success: false, message: 'File not found' });
        return;
      }

      serveFile(res, absolutePath, req.headers.range);
      return;
    }

    // 404 for everything else
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n📁 Media server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Media endpoint: http://localhost:${PORT}/media?path=<relative-path>`);
  console.log(`   Direct access: http://localhost:${PORT}/outputs/<path>\n`);
});
