/**
 * Renderer for error results
 * Displays error messages with retry functionality and suggestions
 */
class ErrorRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { error, code, suggestions } = this.result.content;

    let html = '';

    // Error container with distinctive styling
    html += `
      <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          <h4 class="error-title">Error</h4>
          ${code ? `<span class="error-code">${this.escapeHtml(code)}</span>` : ''}
          <p class="error-message">${this.escapeHtml(error)}</p>
        </div>
      </div>
    `;

    // Suggestions
    if (suggestions && suggestions.length > 0) {
      html += `
        <div class="error-suggestions">
          <h5 class="suggestions-title">Suggestions:</h5>
          <ul class="suggestions-list">
            ${suggestions.map(suggestion => `
              <li class="suggestion-item">${this.escapeHtml(suggestion)}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Retry button (if in task context, retry would be handled by parent)
    html += `
      <div class="error-actions">
        <button class="retry-btn" onclick="window.location.reload()">
          <span>🔄</span> Retry
        </button>
        <button class="copy-error-btn" data-error="${this.escapeHtml(error).replace(/"/g, '&quot;')}">
          <span>📋</span> Copy Error
        </button>
      </div>
    `;

    // Metadata
    html += this.createMetadata().outerHTML;

    container.innerHTML = html;

    // Attach event handlers
    setTimeout(() => this.attachEventHandlers(), 0);

    return container;
  }

  attachEventHandlers() {
    // Copy error button
    const copyBtn = this.element.querySelector('.copy-error-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyError();
      });
    }
  }

  copyError() {
    const { error, code } = this.result.content;
    const errorText = code ? `[${code}] ${error}` : error;

    navigator.clipboard.writeText(errorText).then(() => {
      const copyBtn = this.element.querySelector('.copy-error-btn');
      const originalText = copyBtn.innerHTML;

      copyBtn.innerHTML = '<span>✓</span> Copied!';
      copyBtn.classList.add('copied');

      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy error:', err);
    });
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.ErrorRenderer = ErrorRenderer;
}
