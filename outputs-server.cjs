#!/usr/bin/env node

/**
 * Simple Express server to serve outputs directory with proper MIME types
 * Runs on port 3001
 */

const express = require('express');
const app = express();
const { join, extname } = require('path');
const { existsSync, readFileSync, statSync } = require('fs');
const PORT = 3001;

// MIME type mapping
const mimeTypes = {
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  // Image
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  // Document
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function getMimeType(filepath) {
  const ext = extname(filepath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

// Serve all files from outputs directory
app.use('/outputs', (req, res) => {
  try {
    const filePath = req.path.replace(/^\/outputs\//, '');
    const absolutePath = join(__dirname, 'outputs', filePath);

    if (!existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const stats = statSync(absolutePath);
    const fileBuffer = readFileSync(absolutePath);
    const mimeType = getMimeType(filePath);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
  console.log(`\n📁 Outputs server running on http://localhost:${PORT}`);
  console.log(`📂 Health check: http://localhost:${PORT}/health`);
  console.log(`📂 Example: http://localhost:${PORT}/outputs/videos/file.mp4\n`);
});
