/**
 * State Operations Safety Utilities.
 *
 * Enhanced version with:
 * - Recursion depth detection
 * - Dangerous getter detection
 * - JSON serialization to avoid triggering getters
 * - Diagnostic functions
 *
 * Created to fix:
 * 1. wrapObject infinite recursion bug in @motiadev/core
 * 2. Stack overflow from dangerous getters
 */

/**
 * Maximum allowed history size.
 * Reduced from 100 to 20 to prevent stack overflow in wrapObject.
 */
export const MAX_HISTORY_SIZE = 20;

/**
 * Maximum recursion depth to prevent stack overflow.
 */
const MAX_RECURSION_DEPTH = 50;

/**
 * Track active get operations to detect loops.
 * Key: groupId:key, Value: depth
 */
const activeGets = new Map<string, number>();

/**
 * Detect circular references in objects.
 * Prevents Motia wrapObject infinite recursion bug.
 * Uses iterative approach instead of recursion to avoid stack overflow.
 */
export function hasCircularReference(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;

  const seen = new WeakSet();
  const stack = [obj];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) {
      return true;
    }
    seen.add(current);

    for (const value of Object.values(current)) {
      if (typeof value === 'object' && value !== null) {
        stack.push(value);
      }
    }
  }

  return false;
}

/**
 * Check if object has dangerous getters that might trigger recursion.
 * Getters with parameters (getter.length > 0) are particularly dangerous.
 */
function hasDangerousGetters(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;

  try {
    // Check own properties
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    for (const [prop, descriptor] of Object.entries(descriptors)) {
      if (descriptor.get && descriptor.get.length > 0) {
        console.warn(`[state-safety] Detected dangerous getter on '${prop}' (length: ${descriptor.get.length})`);
        return true;
      }
    }

    // Check prototype chain
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
      const protoDescriptors = Object.getOwnPropertyDescriptors(proto);
      for (const [prop, descriptor] of Object.entries(protoDescriptors)) {
        if (descriptor.get) {
          console.warn(`[state-safety] Detected getter on prototype '${prop}'`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.warn('[state-safety] Error checking for getters:', error);
    return false;
  }
}

/**
 * Safe deep clone that handles circular references.
 * Returns null if circular reference is detected or clone fails.
 */
export function safeClone<T>(obj: T): T | null {
  try {
    if (hasCircularReference(obj)) {
      console.warn('[state-safety] Circular reference detected, returning null');
      return null;
    }
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.warn('[state-safety] Clone failed:', error);
    return null;
  }
}

/**
 * Simplify history entry to prevent complex nested structures.
 * Reduces memory and prevents wrapObject issues.
 */
export function simplifyHistoryEntry(entry: any): any {
  return {
    taskId: entry.taskId,
    timestamp: entry.timestamp,
    task: entry.task,
    success: entry.success,
    sessionId: entry.sessionId,
    output: entry.output, // 不截断，保留完整输出
    error: entry.error,
    executionTime: entry.executionTime,
    metadata: entry.metadata,
  };
}

/**
 * Safe state get operation with enhanced protection.
 *
 * Enhancements:
 * 1. Recursion depth tracking - prevents infinite loops
 * 2. Dangerous getter detection - uses JSON to avoid triggering them
 * 3. Proper cleanup in finally block
 */
export async function safeStateGet(
  state: any,
  groupId: string,
  key: string,
  fallback: any = null
): Promise<any> {
  const callKey = `${groupId}:${key}`;
  const currentDepth = activeGets.get(callKey) || 0;

  // Check for recursion
  if (currentDepth > MAX_RECURSION_DEPTH) {
    console.error(`[state-safety] 🚨 Maximum recursion depth exceeded for ${callKey}`);
    console.error(`[state-safety] Active gets:`, Array.from(activeGets.entries()));
    return fallback;
  }

  // Track this get operation
  activeGets.set(callKey, currentDepth + 1);

  try {
    const rawValue = await state.get(groupId, key);

    if (rawValue === null || rawValue === undefined) {
      return fallback;
    }

    // For objects with dangerous getters, use JSON to avoid triggering them
    if (typeof rawValue === 'object' && rawValue !== null) {
      if (hasDangerousGetters(rawValue)) {
        console.warn(`[state-safety] Using JSON serialization to avoid dangerous getters in ${callKey}`);
        try {
          return JSON.parse(JSON.stringify(rawValue));
        } catch (jsonError) {
          console.error('[state-safety] JSON serialization failed:', jsonError);
          return fallback;
        }
      }

      // For arrays (like history), apply special handling
      if (Array.isArray(rawValue)) {
        const safeArray = [];
        for (const item of rawValue) {
          // Skip any items that have circular references
          if (!hasCircularReference(item)) {
            safeArray.push(simplifyHistoryEntry(item));
          }
        }
        return safeArray;
      }

      // For objects, check for circular references
      const cloned = safeClone(rawValue);
      return cloned !== null ? cloned : fallback;
    }

    return rawValue;
  } catch (error) {
    console.error(`[state-safety] Error getting state for ${callKey}:`, error);
    return fallback;
  } finally {
    // Always decrement depth, even if error occurred
    activeGets.set(callKey, currentDepth);

    // Clean up if back to 0
    if (currentDepth === 0) {
      activeGets.delete(callKey);
    }
  }
}

/**
 * Safe state set operation with circular reference protection.
 */
export async function safeStateSet(
  state: any,
  groupId: string,
  key: string,
  value: any
): Promise<boolean> {
  try {
    // Validate value before storing
    if (hasCircularReference(value)) {
      console.error('[state-safety] Circular reference detected, will not store');
      return false;
    }

    await state.set(groupId, key, value);
    return true;
  } catch (error) {
    console.error('[state-safety] Error setting state:', error);
    return false;
  }
}

/**
 * Get diagnostics about current state operations.
 * Useful for monitoring and debugging.
 */
export function getStateDiagnostics(): {
  activeGets: Record<string, number>;
  hasPotentialLoop: boolean;
  maxDepth: number;
} {
  const activeGetsRecord: Record<string, number> = {};
  let maxDepth = 0;

  for (const [key, depth] of activeGets.entries()) {
    activeGetsRecord[key] = depth;
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return {
    activeGets: activeGetsRecord,
    hasPotentialLoop: maxDepth > 10, // Warning threshold
    maxDepth,
  };
}

/**
 * Clear all active get tracking.
 * Use this for testing or recovery.
 */
export function clearGetTracking(): void {
  activeGets.clear();
}
