import { defineConfig } from '@motiadev/core';
import endpointPlugin from '@motiadev/plugin-endpoint/plugin';
import logsPlugin from '@motiadev/plugin-logs/plugin';
import observabilityPlugin from '@motiadev/plugin-observability/plugin';
import statesPlugin from '@motiadev/plugin-states/plugin';
import bullmqPlugin from '@motiadev/plugin-bullmq/plugin';

// Note: We do NOT use Agent/Sandbox plugins in global configuration because:
// 1. They are imported directly in individual steps that need them
// 2. This avoids unnecessary plugin interface complexity
// 3. Aligns with framework-agnostic architecture where Motia handles only event flow

export default defineConfig({
  plugins: [
    // 🔧 Observability plugin disabled to prevent infinite recursion with Stream operations
    // Issue: Stream.set() → Redis write → Observability tracing → Redis write → recursion
    // Impact: Tracing UI is disabled, but Logs UI and all core features still work
    // For TaskHook progress updates, tracing is not needed and would create noise
    // observabilityPlugin,

    // Core plugins (still active)
    statesPlugin,
    endpointPlugin,
    logsPlugin,
    bullmqPlugin,
  ],
});
