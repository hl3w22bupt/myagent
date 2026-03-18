# Development Lessons - MyAgent Project

## Frontend Development Pitfalls

### CSS Modules vs Regular CSS (CRITICAL)

**Problem:** Adding new CSS files with regular `.css` extension causes layout pollution across other pages.

**Discovery:** Mar 18, 2026 - `feature/token-usage-tracking` branch

**Symptoms:**
- Tasks page layout broken after adding Analytics page
- Fonts appearing too large
- UI elements misaligned

**Root Cause:**
- Regular CSS files in React/Vite get loaded globally regardless of component
- Even with scoped selectors (`.analytics`), large CSS files (300+ lines) affect browser style recalculation
- Vite's HMR (Hot Module Replacement) can mix styles from different components during development

**Solution:** Always use **CSS Modules** for new feature components:

❌ **WRONG** - Regular CSS causes pollution:
```css
/* Analytics.css */
.analytics { padding: 2rem 0; }
```
```jsx
import './Analytics.css';
<div className="analytics">...</div>
```

✅ **CORRECT** - CSS Modules isolate styles:
```css
/* Analytics.module.css */
.container { padding: 2rem 0; }
```
```jsx
import styles from './Analytics.module.css';
<div className={styles.container}>...</div>
```

**Why CSS Modules Work:**
- Transforms `.container` to unique class: `Analytics_container__abc123`
- Completely isolated from other components
- No global style pollution
- No HMR conflicts

**Files That Caused Issue:**
- `Analytics.css` (324 lines) - Deleted, replaced with `Analytics.module.css`
- `TokenUsageTab.css` (312 lines) - Need to recreate with CSS Modules if needed

**Testing Method:**
- Used control variable method to isolate the issue
- Deleted files one by one until layout recovered
- Confirmed: Problem was regular CSS, not font sizes or layouts

**Lesson Learned:**
🚨 **NEVER use regular `.css` files for new React components. Always use `.module.css`**
