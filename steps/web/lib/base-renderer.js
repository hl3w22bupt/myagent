/**
 * Base class for all result renderers
 * Provides common utilities and enforces renderer interface
 */
class BaseResultRenderer {
  constructor(result) {
    this.result = result;
    this.element = null;
  }

  /**
   * Must be implemented by subclasses
   * @returns {HTMLElement} The rendered DOM element
   */
  render() {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Get file URL from path (relative to outputs/)
   */
  getFileUrl(path) {
    return `/outputs/${path}`;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Format duration for display
   */
  formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create a container element with common styling
   */
  createContainer() {
    const container = document.createElement('div');
    container.className = 'result-container';
    return container;
  }

  /**
   * Create metadata display
   */
  createMetadata() {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'result-metadata';

    const metadata = this.result.metadata || {};
    const entries = Object.entries(metadata);

    if (entries.length === 0) {
      metaDiv.style.display = 'none';
      return metaDiv;
    }

    entries.forEach(([key, value]) => {
      const item = document.createElement('div');
      item.className = 'metadata-item';
      item.innerHTML = `
        <span class="metadata-label">${this.escapeHtml(key)}:</span>
        <span class="metadata-value">${this.escapeHtml(String(value))}</span>
      `;
      metaDiv.appendChild(item);
    });

    return metaDiv;
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.BaseResultRenderer = BaseResultRenderer;
}
