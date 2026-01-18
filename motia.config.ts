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
    // Motia built-in plugins
    observabilityPlugin,
    statesPlugin,
    endpointPlugin,
    logsPlugin,
    bullmqPlugin,
  ],
});
