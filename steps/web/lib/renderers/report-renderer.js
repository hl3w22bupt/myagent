/**
 * Renderer for report results
 * Displays structured reports with collapsible sections
 */
class ReportRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { type, title, summary, data } = this.result.content;

    let html = '';

    // Title
    if (title) {
      html += `
        <div class="result-title">
          <h3>${this.escapeHtml(title)}</h3>
        </div>
      `;
    }

    // Summary
    if (summary) {
      html += `
        <div class="report-summary">
          <p>${this.escapeHtml(summary)}</p>
        </div>
      `;
    }

    // Report type badge
    html += `
      <div class="report-type-badge">
        <span class="badge">${this.escapeHtml(type)}</span>
      </div>
    `;

    // Collapsible sections
    const sections = this.generateSections(data);
    if (sections.length > 0) {
      html += `
        <div class="report-sections">
          ${sections.join('')}
        </div>
      `;
    }

    // Metadata
    html += this.createMetadata().outerHTML;

    container.innerHTML = html;

    // Attach event handlers
    setTimeout(() => this.attachEventHandlers(), 0);

    return container;
  }

  generateSections(data) {
    const sections = [];

    // Score section if present
    if (data.score !== undefined) {
      sections.push(this.createScoreSection(data.score));
    }

    // Issues section
    if (data.issues && data.issues.length > 0) {
      sections.push(this.createIssuesSection(data.issues));
    }

    // Suggestions section
    if (data.suggestions && data.suggestions.length > 0) {
      sections.push(this.createSuggestionsSection(data.suggestions));
    }

    // Metrics section
    if (data.metrics && Object.keys(data.metrics).length > 0) {
      sections.push(this.createMetricsSection(data.metrics));
    }

    // Generic key-value pairs
    const otherData = this.filterKnownFields(data);
    if (Object.keys(otherData).length > 0) {
      sections.push(this.createGenericSection(otherData));
    }

    return sections;
  }

  filterKnownFields(data) {
    const knownFields = ['score', 'issues', 'suggestions', 'metrics', 'type', 'title', 'summary'];
    const filtered = {};

    for (const [key, value] of Object.entries(data)) {
      if (!knownFields.includes(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  createScoreSection(score) {
    const scoreNum = parseFloat(score);
    const percentage = Math.round(scoreNum * 100);
    const colorClass = this.getScoreColorClass(scoreNum);

    return `
      <div class="report-section collapsed">
        <div class="section-header">
          <h4 class="section-title">Overall Score</h4>
          <span class="section-toggle">▶</span>
        </div>
        <div class="section-content" style="display: none;">
          <div class="score-display ${colorClass}">
            <div class="score-circle">
              <span class="score-value">${percentage}%</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getScoreColorClass(score) {
    if (score >= 0.8) return 'score-excellent';
    if (score >= 0.6) return 'score-good';
    if (score >= 0.4) return 'score-fair';
    return 'score-poor';
  }

  createIssuesSection(issues) {
    const items = issues.map((issue, index) => `
      <div class="issue-item">
        <span class="issue-number">${index + 1}</span>
        <div class="issue-content">
          <p class="issue-message">${this.escapeHtml(issue.message || issue)}</p>
          ${issue.severity ? `<span class="issue-severity severity-${issue.severity}">${issue.severity}</span>` : ''}
          ${issue.location ? `<p class="issue-location">📍 ${this.escapeHtml(issue.location)}</p>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <div class="report-section collapsed">
        <div class="section-header">
          <h4 class="section-title">Issues (${issues.length})</h4>
          <span class="section-toggle">▶</span>
        </div>
        <div class="section-content" style="display: none;">
          <div class="issues-list">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  createSuggestionsSection(suggestions) {
    const items = suggestions.map((suggestion, index) => `
      <div class="suggestion-item">
        <span class="suggestion-bullet">💡</span>
        <p class="suggestion-text">${this.escapeHtml(suggestion.text || suggestion)}</p>
      </div>
    `).join('');

    return `
      <div class="report-section collapsed">
        <div class="section-header">
          <h4 class="section-title">Suggestions (${suggestions.length})</h4>
          <span class="section-toggle">▶</span>
        </div>
        <div class="section-content" style="display: none;">
          <div class="suggestions-list">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  createMetricsSection(metrics) {
    const items = Object.entries(metrics).map(([key, value]) => `
      <div class="metric-item">
        <span class="metric-label">${this.escapeHtml(key)}:</span>
        <span class="metric-value">${this.escapeHtml(String(value))}</span>
      </div>
    `).join('');

    return `
      <div class="report-section collapsed">
        <div class="section-header">
          <h4 class="section-title">Metrics</h4>
          <span class="section-toggle">▶</span>
        </div>
        <div class="section-content" style="display: none;">
          <div class="metrics-grid">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  createGenericSection(data) {
    const items = Object.entries(data).map(([key, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      return `
        <div class="generic-data-item">
          <span class="data-label">${this.escapeHtml(key)}:</span>
          <pre class="data-value">${this.escapeHtml(displayValue)}</pre>
        </div>
      `;
    }).join('');

    return `
      <div class="report-section collapsed">
        <div class="section-header">
          <h4 class="section-title">Additional Data</h4>
          <span class="section-toggle">▶</span>
        </div>
        <div class="section-content" style="display: none;">
          <div class="generic-data-list">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  attachEventHandlers() {
    // Section toggle
    const sections = this.element.querySelectorAll('.report-section');
    sections.forEach(section => {
      const header = section.querySelector('.section-header');
      const toggle = section.querySelector('.section-toggle');
      const content = section.querySelector('.section-content');

      header.addEventListener('click', () => {
        const isCollapsed = section.classList.contains('collapsed');

        if (isCollapsed) {
          section.classList.remove('collapsed');
          section.classList.add('expanded');
          toggle.textContent = '▼';
          content.style.display = '';
        } else {
          section.classList.remove('expanded');
          section.classList.add('collapsed');
          toggle.textContent = '▶';
          content.style.display = 'none';
        }
      });
    });
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.ReportRenderer = ReportRenderer;
}
