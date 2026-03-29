# Web UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a professional, modern web interface that intelligently displays results from all skill types using their unified output schema.

**Architecture:**
- Single-page application embedded in existing `/ui` endpoint
- Result renderer system that automatically selects display based on `result_type`
- Progressive enhancement - works with current API
- Backward compatible with existing task format

**Tech Stack:**
- Vanilla JavaScript (no framework dependencies)
- Inline CSS in task-ui.step.ts
- Existing Motia backend APIs
- Unified output schema from refactored skills

---

## Task 1: Create Result Type Definitions

**Files:**
- Create: `steps/web/result-types.ts`

**Implementation:**
```typescript
export type ResultType =
  | 'text'
  | 'markdown'
  | 'code'
  | 'table'
  | 'infographic'
  | 'video'
  | 'report'
  | 'mixed'
  | 'error';

export interface BaseResult {
  result_type: ResultType;
  success: boolean;
  content: any;
  metadata: Record<string, any>;
}

export interface TextResult extends BaseResult {
  result_type: 'text';
  content: { text: string; title?: string; };
}

export interface TableResult extends BaseResult {
  result_type: 'table';
  content: {
    type: string;
    title: string;
    columns: string[];
    rows: any[][];
  };
}

export interface MediaContent {
  path: string;
  mime_type: string;
  size?: number;
  duration?: number;
  fps?: number;
  resolution?: string;
  thumbnail_path?: string;
}

export interface InfographicResult extends BaseResult {
  result_type: 'infographic';
  content: MediaContent & { title?: string; description?: string; };
}

export interface VideoResult extends BaseResult {
  result_type: 'video';
  content: MediaContent;
}

export interface ReportResult extends BaseResult {
  result_type: 'report';
  content: {
    type: string;
    title: string;
    summary?: string;
    data: Record<string, any>;
  };
}

export interface ErrorResult extends BaseResult {
  result_type: 'error';
  content: {
    error: string;
    code?: string;
    suggestions?: string[];
  };
}

export type AnyResult = TextResult | TableResult | InfographicResult | VideoResult | ReportResult | ErrorResult;
```

**Verification:**
- Run: `npx tsc --noEmit steps/web/result-types.ts`
- Expected: No type errors

**Commit:**
```bash
git add steps/web/result-types.ts
git commit -m "feat: add unified result type definitions"
```

---

## Task 2: Create Base Renderer Class

**Files:**
- Create: `steps/web/lib/base-renderer.js`

**Implementation:**
```javascript
class BaseResultRenderer {
  constructor(result) {
    this.result = result;
    this.element = null;
  }

  render() {
    throw new Error('render() must be implemented by subclass');
  }

  getFileUrl(path) {
    return `/outputs/${path}`;
  }

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

  formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  createContainer() {
    const container = document.createElement('div');
    container.className = 'result-container';
    return container;
  }

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

if (typeof window !== 'undefined') {
  window.BaseResultRenderer = BaseResultRenderer;
}
```

**Verification:**
- Run: `node -c steps/web/lib/base-renderer.js`
- Expected: No syntax errors

**Commit:**
```bash
git add steps/web/lib/base-renderer.js
git commit -m "feat: add base result renderer class"
```

---

## Tasks 3-8: Implement Individual Renderers

**Task 3: Text Renderer** - `steps/web/lib/renderers/text-renderer.js`
**Task 4: Table Renderer** - `steps/web/lib/renderers/table-renderer.js` (with sort/search/export)
**Task 5: Infographic Renderer** - `steps/web/lib/renderers/infographic-renderer.js` (with fullscreen/download)
**Task 6: Video Renderer** - `steps/web/lib/renderers/video-renderer.js`
**Task 7: Report Renderer** - `steps/web/lib/renderers/report-renderer.js` (collapsible sections)
**Task 8: Error Renderer** - `steps/web/lib/renderers/error-renderer.js`

Each follows the same pattern as Task 2.

---

## Task 9: Create Renderer Registry

**Files:**
- Create: `steps/web/lib/result-registry.js`

---

## Task 10: Update task-ui.step.ts

**Files:**
- Modify: `steps/web/task-ui.step.ts`

Integrate all renderers into the UI, add CSS styles.

---

## Task 11: Add Comprehensive CSS

**Files:**
- Modify: `steps/web/task-ui.step.ts` (in <style> section)

---

## Task 12: Integration Testing

Test with real skills and verify all renderers work.

---

## Success Criteria

✅ All 6 renderers implemented
✅ Renderer registry routes correctly
✅ Integration test passes
✅ Interactive features work
✅ Backward compatible
✅ No TypeScript errors
