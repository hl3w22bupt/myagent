/**
 * Renderer for infographic results
 * Displays infographic images with fullscreen and download capabilities
 */
class InfographicRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { path, mime_type, size, title, description } = this.result.content;

    let html = '';

    // Title
    if (title) {
      html += `
        <div class="result-title">
          <h3>${this.escapeHtml(title)}</h3>
        </div>
      `;
    }

    // Description
    if (description) {
      html += `
        <div class="result-description">
          <p>${this.escapeHtml(description)}</p>
        </div>
      `;
    }

    // Image container with controls
    html += `
      <div class="infographic-container">
        <div class="infographic-controls">
          <button class="fullscreen-btn" data-image-url="${this.getFileUrl(path)}" title="View Fullscreen">
            <span>⛶</span> Fullscreen
          </button>
          <button class="download-btn" data-image-url="${this.getFileUrl(path)}" data-filename="${this.getFilename(path)}" title="Download">
            <span>⬇</span> Download
          </button>
        </div>
        <div class="infographic-wrapper">
          <img
            src="${this.getFileUrl(path)}"
            alt="${this.escapeHtml(title || 'Infographic')}"
            class="infographic-image"
            data-mime-type="${mime_type}"
          />
        </div>
      </div>
    `;

    // File metadata
    html += `
      <div class="file-metadata">
        ${size ? `<span class="file-size">${this.formatFileSize(size)}</span>` : ''}
        <span class="file-type">${mime_type}</span>
      </div>
    `;

    // Metadata
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
    // Fullscreen button
    const fullscreenBtn = this.element.querySelector('.fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        this.openFullscreen();
      });
    }

    // Download button
    const downloadBtn = this.element.querySelector('.download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadImage();
      });
    }

    // Image click for fullscreen
    const image = this.element.querySelector('.infographic-image');
    if (image) {
      image.addEventListener('click', () => {
        this.openFullscreen();
      });
      image.style.cursor = 'pointer';
    }
  }

  openFullscreen() {
    const image = this.element.querySelector('.infographic-image');
    if (!image) return;

    // Create fullscreen modal
    const modal = document.createElement('div');
    modal.className = 'fullscreen-modal';
    modal.innerHTML = `
      <div class="fullscreen-content">
        <button class="fullscreen-close">&times;</button>
        <img src="${image.src}" alt="${image.alt}" class="fullscreen-image" />
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Close on button click
    const closeBtn = modal.querySelector('.fullscreen-close');
    closeBtn.addEventListener('click', () => {
      this.closeFullscreen(modal);
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeFullscreen(modal);
      }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeFullscreen(modal);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  closeFullscreen(modal) {
    modal.remove();
    document.body.style.overflow = '';
  }

  downloadImage() {
    const { path, mime_type } = this.result.content;
    const url = this.getFileUrl(path);
    const filename = this.getFilename(path);

    // Fetch and download
    fetch(url)
      .then(response => response.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(error => {
        console.error('Failed to download image:', error);
        // Fallback: open in new tab
        window.open(url, '_blank');
      });
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.InfographicRenderer = InfographicRenderer;
}
