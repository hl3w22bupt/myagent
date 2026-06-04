/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * III Worker Entry Point.
 *
 * Connects to the iii engine, loads compiled step files from dist/steps/,
 * and registers them via the iii-sdk.
 */
import { initIII, type StepConfig } from './iii-bridge.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { randomUUID } from 'crypto';

const STEPS_DIR = join(process.cwd(), 'dist/steps');

function findStepFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findStepFiles(full));
    else if (entry.name.endsWith('.step.js') || entry.name.endsWith('.stream.js')) results.push(full);
  }
  return results;
}

function suffix(trigger: any, i: number): string {
  if (trigger.type === 'http') return `http-${trigger.method?.toLowerCase()}-${i}`;
  if (trigger.type === 'queue') return `queue-${trigger.topic || i}`;
  if (trigger.type === 'cron') return `cron-${i}`;
  return `other-${i}`;
}

async function startWorker() {
  const engineUrl = process.env.III_URL || 'ws://localhost:49135';
  console.log(`[worker] Connecting to engine: ${engineUrl}`);
  const iii: any = initIII(engineUrl);

  const files = findStepFiles(STEPS_DIR);
  console.log(`[worker] Found ${files.length} compiled step files`);

  let steps = 0;
  let streams = 0;

  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href);
      if (!mod.config) continue;

      if (mod.handler) {
        const config = mod.config as StepConfig;
        const handler = mod.handler;

        for (let i = 0; i < config.triggers.length; i++) {
          const t = config.triggers[i] as any;
          const fnId = `steps::${config.name}::${suffix(t, i)}`;
          const meta = { ...config };

          if (t.type === 'http') {
            const apiPath = (t.path || '').replace(/^\//, '');
            iii.registerFunction(fnId, async (req: any, res: any) => {
              const input = {
                request: {
                  pathParams: req.path_params || {},
                  queryParams: req.query_params || {},
                  body: req.body,
                  headers: req.headers || {},
                  method: req.method,
                  requestBody: req.request_body,
                },
                response: res,
              };
              const result = await handler(input, {
                traceId: req.trace_id || randomUUID(),
                trigger: { type: 'http', index: i },
                is: { queue: false, http: true, cron: false, state: false, stream: false },
                getData: () => input.request.body,
                match: (h: any) => h.http?.(input),
              });
              if (result) return { status_code: result.status, body: result.body, headers: result.headers };
            });
            iii.registerTrigger({
              type: 'http',
              function_id: fnId,
              config: { api_path: apiPath, http_method: t.method },
              metadata: meta,
            });
          } else if (t.type === 'queue') {
            iii.registerFunction(fnId, async (payload: any) => {
              const data = payload?.payload || payload;
              await handler(data, {
                traceId: payload?.trace_id || randomUUID(),
                trigger: { type: 'queue', index: i, topic: t.topic },
                is: { queue: true, http: false, cron: false, state: false, stream: false },
                getData: () => data,
                match: (h: any) => h.queue?.(data),
              });
            });
            iii.registerTrigger({
              type: 'subscribe',
              function_id: fnId,
              config: { topic: t.topic },
              metadata: meta,
            });
          } else if (t.type === 'cron') {
            iii.registerFunction(fnId, async (payload: any) => {
              await handler(undefined, {
                traceId: payload?.trace_id || randomUUID(),
                trigger: { type: 'cron', index: i, expression: t.expression },
                is: { queue: false, http: false, cron: true, state: false, stream: false },
                getData: () => undefined,
                match: (h: any) => h.cron?.(),
              });
            });
            iii.registerTrigger({
              type: 'cron',
              function_id: fnId,
              config: { cron_expression: t.expression },
              metadata: meta,
            });
          }
        }
        steps++;
      } else {
        // Stream definition
        streams++;
      }
    } catch (err: any) {
      console.error(`[worker] Error registering step: ${err.message}`);
    }
  }

  console.log(`[worker] Registered ${steps} steps, ${streams} streams. Ready.`);

  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

process.on('unhandledRejection', (reason) => console.error('[worker] Unhandled rejection:', reason));

startWorker().catch((err) => {
  console.error('[worker] Fatal:', err);
  process.exit(1);
});
