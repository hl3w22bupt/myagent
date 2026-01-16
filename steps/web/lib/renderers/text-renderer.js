/**
 * Renderer for text results
 * Displays plain text with optional title and formatting
 */
class TextRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { text, title } = this.result.content;

    let html = '';

    // Title
    if (title) {
      html += `
        <div class="result-title">
          <h3>${this.escapeHtml(title)}</h3>
        </div>
      `;
    }

    // Text content
    html += `
      <div class="text-content">
        <pre class="text-display">${this.escapeHtml(text)}</pre>
      </div>
    `;

    // Metadata
    html += this.createMetadata().outerHTML;

    container.innerHTML = html;
    return container;
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.TextRenderer = TextRenderer;
}
