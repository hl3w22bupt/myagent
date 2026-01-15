/**
 * Renderer for table results
 * Displays structured data with sorting, searching, and export capabilities
 */
class TableRenderer extends BaseResultRenderer {
  render() {
    const container = this.createContainer();
    const { type, title, columns, rows } = this.result.content;

    let html = '';

    // Title
    if (title) {
      html += `
        <div class="result-title">
          <h3>${this.escapeHtml(title)}</h3>
        </div>
      `;
    }

    // Controls (Search and Export)
    html += `
      <div class="table-controls">
        <input
          type="text"
          class="table-search"
          placeholder="Search table..."
          data-table-id="${this.getTableId()}"
        />
        <button class="table-export-btn" data-table-id="${this.getTableId()}">
          Export CSV
        </button>
      </div>
    `;

    // Table
    html += `
      <div class="table-content">
        <table class="data-table" id="${this.getTableId()}">
          <thead>
            <tr>
              ${columns.map((col, index) => `
                <th class="sortable" data-column="${index}">
                  ${this.escapeHtml(col)}
                  <span class="sort-indicator">↕</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, rowIndex) => `
              <tr data-row="${rowIndex}">
                ${row.map((cell, cellIndex) => `
                  <td data-column="${cellIndex}">${this.escapeHtml(String(cell))}</td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Row count info
    html += `
      <div class="table-info">
        <span class="row-count">${rows.length} rows</span>
      </div>
    `;

    // Metadata
    html += this.createMetadata().outerHTML;

    container.innerHTML = html;

    // Attach event handlers after DOM is ready
    setTimeout(() => this.attachEventHandlers(), 0);

    return container;
  }

  getTableId() {
    return `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  attachEventHandlers() {
    const table = document.getElementById(this.getTableId());
    if (!table) return;

    // Sorting
    table.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const column = parseInt(th.dataset.column);
        this.sortTable(column, th);
      });
    });

    // Search
    const searchInput = document.querySelector(`.table-search[data-table-id="${this.getTableId()}"]`);
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTable(e.target.value);
      });
    }

    // Export
    const exportBtn = document.querySelector(`.table-export-btn[data-table-id="${this.getTableId()}"]`);
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportCSV();
      });
    }
  }

  sortTable(columnIndex, headerElement) {
    const table = document.getElementById(this.getTableId());
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Determine sort direction
    const currentSort = headerElement.dataset.sort || 'none';
    const newSort = currentSort === 'asc' ? 'desc' : 'asc';
    headerElement.dataset.sort = newSort;

    // Update sort indicators
    table.querySelectorAll('th.sortable').forEach(th => {
      th.querySelector('.sort-indicator').textContent = '↕';
    });
    headerElement.querySelector('.sort-indicator').textContent = newSort === 'asc' ? '↑' : '↓';

    // Sort rows
    rows.sort((a, b) => {
      const aCell = a.querySelector(`td[data-column="${columnIndex}"]`).textContent;
      const bCell = b.querySelector(`td[data-column="${columnIndex}"]`).textContent;

      const comparison = aCell.localeCompare(bCell, undefined, { numeric: true });
      return newSort === 'asc' ? comparison : -comparison;
    });

    // Reorder rows
    rows.forEach(row => tbody.appendChild(row));
  }

  searchTable(query) {
    const table = document.getElementById(this.getTableId());
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    const lowerQuery = query.toLowerCase();

    let visibleCount = 0;

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const isVisible = text.includes(lowerQuery);
      row.style.display = isVisible ? '' : 'none';
      if (isVisible) visibleCount++;
    });

    // Update row count
    const rowCountSpan = table.parentElement.parentElement.querySelector('.row-count');
    if (rowCountSpan) {
      rowCountSpan.textContent = `${visibleCount} of ${rows.length} rows`;
    }
  }

  exportCSV() {
    const { columns, rows } = this.result.content;

    // Build CSV content
    const csvLines = [
      columns.map(col => this.escapeCSV(col)).join(','),
      ...rows.map(row =>
        row.map(cell => this.escapeCSV(String(cell))).join(',')
      )
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Download file
    const link = document.createElement('a');
    link.href = url;
    link.download = `table-${Date.now()}.csv`;
    link.click();

    // Cleanup
    URL.revokeObjectURL(url);
  }

  escapeCSV(text) {
    // Wrap in quotes if contains comma, quote, or newline
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}

// Register globally
if (typeof window !== 'undefined') {
  window.TableRenderer = TableRenderer;
}
