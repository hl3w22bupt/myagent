/**
 * Renderer for video results
 * Displays video with player controls and metadata
 */
class VideoRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { path, mime_type, size, duration, fps, resolution } = this.result.content;

    let html = '';

    // Video player container
    html += `
      <div class="video-container">
        <video
          src="${this.getFileUrl(path)}"
          controls
          class="video-player"
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    `;

    // Video metadata grid
    const metadataItems = [];

    if (duration) {
      metadataItems.push(`
        <div class="video-metadata-item">
          <span class="metadata-label">Duration:</span>
          <span class="metadata-value">${this.formatDuration(duration)}</span>
        </div>
      `);
    }

    if (resolution) {
      metadataItems.push(`
        <div class="video-metadata-item">
          <span class="metadata-label">Resolution:</span>
          <span class="metadata-value">${this.escapeHtml(resolution)}</span>
        </div>
      `);
    }

    if (fps) {
      metadataItems.push(`
        <div class="video-metadata-item">
          <span class="metadata-label">Frame Rate:</span>
          <span class="metadata-value">${fps} FPS</span>
        </div>
      `);
    }

    if (size) {
      metadataItems.push(`
        <div class="video-metadata-item">
          <span class="metadata-label">File Size:</span>
          <span class="metadata-value">${this.formatFileSize(size)}</span>
        </div>
      `);
    }

    metadataItems.push(`
      <div class="video-metadata-item">
        <span class="metadata-label">Format:</span>
        <span class="metadata-value">${this.escapeHtml(mime_type)}</span>
      </div>
    `);

    if (metadataItems.length > 0) {
      html += `
        <div class="video-metadata">
          ${metadataItems.join('')}
        </div>
      `;
    }

    // Download button
    html += `
      <div class="video-actions">
        <button class="download-btn" data-video-url="${this.getFileUrl(path)}" data-filename="${this.getFilename(path)}">
          <span>⬇</span> Download Video
        </button>
      </div>
    `;

    // Additional metadata
    html += this.createMetadata().outerHTML;

    container.innerHTML = html;

    // Attach event handlers
    setTimeout(() => this.attachEventHandlers(), 0);

    return container;
  }

  getFilename(path) {
    return path.split('/').pop();
  }

  attachEventHandlers() {
    // Download button
    const downloadBtn = this.element.querySelector('.download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadVideo();
      });
    }
  }

  downloadVideo() {
    const { path } = this.result.content;
    const url = this.getFileUrl(path);
    const filename = this.getFilename(path);

    // Direct download using anchor tag
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.VideoRenderer = VideoRenderer;
}
