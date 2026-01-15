/**
 * Result Renderer Registry
 * Routes results to appropriate renderers based on result_type
 */

class ResultRendererRegistry {
  constructor() {
    this.renderers = new Map();
    this.fallbackRenderer = null;
  }

  /**
   * Register a renderer for a specific result type
   * @param {string} resultType - The result type (e.g., 'text', 'table', 'infographic')
   * @param {Function} RendererClass - The renderer class constructor
   */
  register(resultType, RendererClass) {
    if (typeof RendererClass !== 'function') {
      throw new Error(`Renderer for "${resultType}" must be a class constructor`);
    }
    this.renderers.set(resultType, RendererClass);
  }

  /**
   * Register a fallback renderer for unknown types
   * @param {Function} RendererClass - The renderer class constructor
   */
  registerFallback(RendererClass) {
    if (typeof RendererClass !== 'function') {
      throw new Error('Fallback renderer must be a class constructor');
    }
    this.fallbackRenderer = RendererClass;
  }

  /**
   * Get the appropriate renderer for a result
   * @param {Object} result - The result object with result_type field
   * @returns {BaseResultRenderer|null} - Renderer instance or null if not found
   */
  getRenderer(result) {
    const resultType = result.result_type || result.type;

    if (!resultType) {
      console.warn('Result missing result_type field, using fallback');
      return this.fallbackRenderer ? new this.fallbackRenderer(result) : null;
    }

    const RendererClass = this.renderers.get(resultType);

    if (!RendererClass) {
      console.warn(`No renderer registered for type "${resultType}", using fallback`);
      return this.fallbackRenderer ? new this.fallbackRenderer(result) : null;
    }

    return new RendererClass(result);
  }

  /**
   * Check if a renderer is registered for a type
   * @param {string} resultType - The result type to check
   * @returns {boolean} - True if renderer is registered
   */
  hasRenderer(resultType) {
    return this.renderers.has(resultType);
  }

  /**
   * Get all registered result types
   * @returns {string[]} - Array of registered result types
   */
  getRegisteredTypes() {
    return Array.from(this.renderers.keys());
  }

  /**
   * Render a result automatically using the appropriate renderer
   * @param {Object} result - The result object to render
   * @returns {HTMLElement|null} - Rendered element or null if no renderer found
   */
  render(result) {
    const renderer = this.getRenderer(result);

    if (!renderer) {
      console.error('No renderer available for result:', result);
      return this.createFallbackElement(result);
    }

    try {
      return renderer.render();
    } catch (error) {
      console.error('Renderer error:', error);
      return this.createErrorElement(result, error);
    }
  }

  /**
   * Create a fallback element when no renderer is available
   * @param {Object} result - The result object
   * @returns {HTMLElement} - Fallback display element
   */
  createFallbackElement(result) {
    const div = document.createElement('div');
    div.className = 'result-container unknown-type';
    div.innerHTML = `
      <div class="unknown-result">
        <p class="unknown-message">Unknown result type: ${this.escapeHtml(result.result_type || 'unknown')}</p>
        <pre class="unknown-data">${this.escapeHtml(JSON.stringify(result, null, 2))}</pre>
      </div>
    `;
    return div;
  }

  /**
   * Create an error element when rendering fails
   * @param {Object} result - The result object
   * @param {Error} error - The error that occurred
   * @returns {HTMLElement} - Error display element
   */
  createErrorElement(result, error) {
    const div = document.createElement('div');
    div.className = 'result-container render-error';
    div.innerHTML = `
      <div class="render-error-content">
        <h4>Rendering Error</h4>
        <p class="error-message">${this.escapeHtml(error.message)}</p>
        <details>
          <summary>Result Data</summary>
          <pre>${this.escapeHtml(JSON.stringify(result, null, 2))}</pre>
        </details>
      </div>
    `;
    return div;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global registry instance
const resultRegistry = new ResultRendererRegistry();

// Auto-register all available renderers
if (typeof window !== 'undefined') {
  // Register core renderers
  if (typeof TextRenderer !== 'undefined') {
    resultRegistry.register('text', TextRenderer);
  }

  if (typeof TableRenderer !== 'undefined') {
    resultRegistry.register('table', TableRenderer);
  }

  if (typeof InfographicRenderer !== 'undefined') {
    resultRegistry.register('infographic', InfographicRenderer);
  }

  if (typeof VideoRenderer !== 'undefined') {
    resultRegistry.register('video', VideoRenderer);
  }

  if (typeof ReportRenderer !== 'undefined') {
    resultRegistry.register('report', ReportRenderer);
  }

  if (typeof ErrorRenderer !== 'undefined') {
    resultRegistry.register('error', ErrorRenderer);
    resultRegistry.registerFallback(ErrorRenderer);
  }

  // Export globally
  window.ResultRendererRegistry = ResultRendererRegistry;
  window.resultRegistry = resultRegistry;
}
