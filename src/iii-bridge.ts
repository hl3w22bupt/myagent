/**
 * III Bridge — drop-in replacement for the `motia` package using pure iii-sdk.
 *
 * Re-exports the same API surface that motia 1.0.x provided:
 *   - types: StepConfig, StreamConfig, TriggerConfig, etc.
 *   - singletons: logger, stateManager, enqueue
 *   - trigger helpers: cron, http, queue, stream, state
 *   - Stream class
 *
 * Under the hood everything delegates to iii-sdk (registerWorker, registerFunction,
 * trigger) so there is zero motia runtime left in the project.
 */

import {
  registerWorker,
  TriggerAction,
  type ISdk,
  type InitOptions,
  type HttpRequest,
  type HttpResponse,
} from 'iii-sdk';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Lazy iii-sdk singleton (same pattern as motia's getInstance)
// ---------------------------------------------------------------------------

let _iii: ISdk | null = null;

export function getIII(): ISdk {
  if (!_iii) {
    const engineUrl = process.env.III_URL || 'ws://localhost:49135';
    _iii = registerWorker(engineUrl, {
      workerName: process.env.WORKER_NAME || `myagent-worker-${process.pid}`,
      invocationTimeoutMs: parseInt(process.env.INVOCATION_TIMEOUT_MS || '30000'),
      otel: {
        enabled: process.env.OTEL_ENABLED !== 'false',
        serviceName: process.env.OTEL_SERVICE_NAME || 'myagent',
      },
    });
  }
  return _iii;
}

export function initIII(engineUrl?: string, opts?: InitOptions): ISdk {
  _iii = registerWorker(engineUrl || process.env.III_URL || 'ws://localhost:49135', opts);
  return _iii;
}

// ---------------------------------------------------------------------------
// Logger (singleton — console-based, replaces removed iii-sdk Logger)
// ---------------------------------------------------------------------------

class ConsoleLogger {
  info(msg: string, meta?: unknown): void {
    console.log(`[INFO] ${msg}`, meta ?? '');
  }
  warn(msg: string, meta?: unknown): void {
    console.warn(`[WARN] ${msg}`, meta ?? '');
  }
  error(msg: string, meta?: unknown): void {
    console.error(`[ERROR] ${msg}`, meta ?? '');
  }
  debug(msg: string, meta?: unknown): void {
    console.debug(`[DEBUG] ${msg}`, meta ?? '');
  }
  _error(msg: string, meta?: unknown): void {
    console.error(`[ERROR] ${msg}`, meta ?? '');
  }
}

export const logger = new ConsoleLogger();

// ---------------------------------------------------------------------------
// enqueue — drop-in for motia's enqueue({ topic, data, messageGroupId? })
// ---------------------------------------------------------------------------

export interface EnqueueData<T = unknown> {
  topic: string;
  data: T;
  messageGroupId?: string;
}

export async function enqueue<T = unknown>(event: EnqueueData<T>): Promise<void> {
  const iii = getIII();
  await iii.trigger({
    function_id: 'publish',
    payload: {
      topic: event.topic,
      data: event.data,
      messageGroupId: event.messageGroupId,
    },
    action: TriggerAction.Void(),
  });
}

// ---------------------------------------------------------------------------
// StateManager — drop-in for motia's stateManager
// ---------------------------------------------------------------------------

class StateManager {
  async get<T>(groupId: string, key: string): Promise<T | null> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'state::get',
      payload: { group_id: groupId, item_id: key },
    });
    return (result as any)?.data ?? null;
  }

  async set<T>(groupId: string, key: string, value: T): Promise<any> {
    const iii = getIII();
    return iii.trigger({
      function_id: 'state::set',
      payload: { group_id: groupId, item_id: key, data: value },
    });
  }

  async update<T>(groupId: string, key: string, ops: any[]): Promise<any> {
    const iii = getIII();
    return iii.trigger({
      function_id: 'state::update',
      payload: { group_id: groupId, item_id: key, data: ops },
    });
  }

  async delete<T>(groupId: string, key: string): Promise<T | null> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'state::delete',
      payload: { group_id: groupId, item_id: key },
    });
    return (result as any)?.data ?? null;
  }

  async list<T>(groupId: string): Promise<T[]> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'state::list',
      payload: { group_id: groupId },
    });
    return (result as any)?.data ?? [];
  }

  async listGroups(): Promise<string[]> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'state::list_groups',
      payload: {},
    });
    return (result as any)?.groups ?? [];
  }

  async clear(groupId: string): Promise<void> {
    const items = await this.list(groupId);
    for (const item of items) {
      await this.delete(groupId, (item as any).id);
    }
  }
}

export const stateManager = new StateManager();

// ---------------------------------------------------------------------------
// Stream class — drop-in for motia's Stream
// ---------------------------------------------------------------------------

export interface StreamConfig {
  name: string;
  schema?: any;
  baseConfig?: { storageType: 'default' };
  onJoin?: (subscription: StreamSubscription, context: any, authContext?: any) => any;
  onLeave?: (subscription: StreamSubscription, context: any, authContext?: any) => any;
  /** Called after each set() to persist data externally (e.g. to PostgreSQL). */
  onPersist?: (groupId: string, itemId: string, data: any) => Promise<void>;
}

export interface StreamSubscription {
  groupId: string;
  id?: string;
}

export interface StateStreamEventChannel {
  groupId: string;
  id?: string;
}

export interface StateStreamEvent<TData> {
  type: string;
  data: TData;
}

export class Stream<TData = any> {
  readonly config: StreamConfig;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  async get(groupId: string, itemId: string): Promise<TData | null> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'stream::get',
      payload: { stream_name: this.config.name, group_id: groupId, item_id: itemId },
    });
    return (result as any)?.data ?? null;
  }

  async set(groupId: string, itemId: string, data: TData): Promise<any> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'stream::set',
      payload: { stream_name: this.config.name, group_id: groupId, item_id: itemId, data },
    });
    // Persist to external store if configured (e.g. PostgreSQL for durability)
    if (this.config.onPersist) {
      this.config.onPersist(groupId, itemId, data).catch((err) => {
        console.error(`[Stream:${this.config.name}] onPersist failed:`, err.message);
      });
    }
    return result;
  }

  async delete(groupId: string, itemId: string): Promise<void> {
    const iii = getIII();
    await iii.trigger({
      function_id: 'stream::delete',
      payload: { stream_name: this.config.name, group_id: groupId, item_id: itemId },
    });
  }

  async list(groupId: string): Promise<TData[]> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'stream::list',
      payload: { stream_name: this.config.name, group_id: groupId },
    });
    return (result as any)?.data ?? [];
  }

  async update(groupId: string, itemId: string, ops: any[]): Promise<any> {
    const iii = getIII();
    return iii.trigger({
      function_id: 'stream::update',
      payload: { stream_name: this.config.name, group_id: groupId, item_id: itemId, data: ops },
    });
  }

  async listGroups(): Promise<string[]> {
    const iii = getIII();
    const result = await iii.trigger({
      function_id: 'stream::list_groups',
      payload: { stream_name: this.config.name },
    });
    return (result as any)?.groups ?? [];
  }

  async send<T>(channel: StateStreamEventChannel, event: StateStreamEvent<T>): Promise<void> {
    const iii = getIII();
    await iii.trigger({
      function_id: 'stream::send',
      payload: { stream_name: this.config.name, group_id: channel.groupId, id: channel.id, event },
    });
  }
}

// ---------------------------------------------------------------------------
// Trigger config types (same shape as motia)
// ---------------------------------------------------------------------------

export type ApiRouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

export interface ApiTrigger {
  type: 'http';
  path: string;
  method: ApiRouteMethod;
  bodySchema?: any;
  responseSchema?: Record<number, any>;
  queryParams?: readonly { name: string; description: string }[];
  middleware?: readonly any[];
  condition?: TriggerCondition;
}

export interface QueueTrigger {
  type: 'queue';
  topic: string;
  input?: any;
  condition?: TriggerCondition;
  config?: Partial<QueueConfig>;
}

export interface CronTrigger {
  type: 'cron';
  expression: string;
  input?: never;
  condition?: TriggerCondition;
}

export interface StateTrigger {
  type: 'state';
  condition?: TriggerCondition;
}

export interface StreamTrigger {
  type: 'stream';
  streamName: string;
  groupId?: string;
  itemId?: string;
  condition?: TriggerCondition;
}

export type TriggerConfig = ApiTrigger | QueueTrigger | CronTrigger | StateTrigger | StreamTrigger;

export interface QueueConfig {
  type: 'fifo' | 'standard';
  maxRetries: number;
  visibilityTimeout: number;
  delaySeconds: number;
  concurrency?: number;
  backoffType?: string;
  backoffDelayMs?: number;
}

export type Enqueue = string | { topic: string; label?: string; conditional?: boolean };

export interface StepConfig {
  name: string;
  description?: string;
  triggers: readonly TriggerConfig[];
  enqueues?: readonly Enqueue[];
  virtualEnqueues?: readonly Enqueue[];
  virtualSubscribes?: readonly string[];
  flows?: readonly string[];
  includeFiles?: readonly string[];
}

export type TriggerInfo = {
  type: 'http' | 'queue' | 'cron' | 'state' | 'stream';
  index?: number;
  path?: string;
  method?: string;
  topic?: string;
  expression?: string;
};

export type TriggerCondition<TInput = unknown> = (
  input: any,
  ctx: any,
) => boolean | Promise<boolean>;

// ---------------------------------------------------------------------------
// Trigger helpers (same signature as motia)
// ---------------------------------------------------------------------------

export function http(
  method: ApiRouteMethod,
  path: string,
  options?: { bodySchema?: any; responseSchema?: Record<number, any>; queryParams?: readonly any[]; middleware?: readonly any[] },
  condition?: TriggerCondition,
): ApiTrigger {
  return {
    type: 'http' as const,
    method,
    path,
    ...options,
    condition,
  };
}

/** @deprecated Use http() instead. */
export const api = http;

export function queue(
  topic: string,
  options?: { input?: any; config?: Partial<QueueConfig> },
  condition?: TriggerCondition,
): QueueTrigger {
  return {
    type: 'queue' as const,
    topic,
    ...options,
    condition,
  };
}

export function cron(expression: string, condition?: TriggerCondition): CronTrigger {
  return { type: 'cron' as const, expression, condition };
}

export function state(condition?: TriggerCondition): StateTrigger {
  return { type: 'state' as const, condition };
}

export function stream(
  streamName: string,
  optionsOrCondition?: { groupId?: string; itemId?: string; condition?: TriggerCondition } | TriggerCondition,
): StreamTrigger {
  if (typeof optionsOrCondition === 'function') {
    return { type: 'stream' as const, streamName, condition: optionsOrCondition };
  }
  return {
    type: 'stream' as const,
    streamName,
    groupId: optionsOrCondition?.groupId,
    itemId: optionsOrCondition?.itemId,
    condition: optionsOrCondition?.condition,
  };
}

// ---------------------------------------------------------------------------
// FlowContext (simplified — used by step handlers at runtime)
// ---------------------------------------------------------------------------

export interface FlowContext<TEnqueueData = never, TInput = unknown> {
  traceId: string;
  trigger: TriggerInfo;
  is: {
    queue: (input: TInput) => boolean;
    http: (input: TInput) => boolean;
    cron: (input: TInput) => boolean;
    state: (input: TInput) => boolean;
    stream: (input: TInput) => boolean;
  };
  getData: () => any;
  match: (handlers: any) => Promise<any>;
}

export function createFlowContext(trigger: TriggerInfo, input: any): FlowContext {
  return {
    traceId: randomUUID(),
    trigger,
    is: {
      queue: () => trigger.type === 'queue',
      http: () => trigger.type === 'http',
      cron: () => trigger.type === 'cron',
      state: () => trigger.type === 'state',
      stream: () => trigger.type === 'stream',
    },
    getData: () => {
      if (trigger.type === 'http') return (input as any)?.request?.body ?? input;
      return input;
    },
    match: async (handlers: any) => {
      const t = trigger.type;
      if (t === 'queue' && handlers.queue) return handlers.queue(input);
      if (t === 'http' && handlers.http) return handlers.http(input);
      if (t === 'cron' && handlers.cron) return handlers.cron();
      if (t === 'state' && handlers.state) return handlers.state(input);
      if (t === 'stream' && handlers.stream) return handlers.stream(input);
      if (handlers.default) return handlers.default(input);
    },
  };
}

// ---------------------------------------------------------------------------
// Re-export types from iii-sdk that motia users might need
// ---------------------------------------------------------------------------

export { TriggerAction, registerWorker };
export type { ISdk, InitOptions, HttpRequest, HttpResponse };
