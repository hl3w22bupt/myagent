/**
 * State Operations Safety Utilities.
 *
 * Contains utilities to prevent Motia state operations from causing
 * stack overflow due to circular references.
 *
 * Created to fix wrapObject infinite recursion bug in @motiadev/core.
 */

/**
 * Maximum allowed history size.
 * Reduced from 100 to 20 to prevent stack overflow in wrapObject.
 */
export const MAX_HISTORY_SIZE = 20;

/**
 * Detect circular references in objects.
 * Prevents Motia wrapObject infinite recursion bug.
 * Uses iterative approach instead of recursion to avoid stack overflow and reduce CPU usage.
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
 * Safe state get operation with circular reference protection.
 * Handles the case where state.get might trigger wrapObject recursion.
 */
export async function safeStateGet(
  state: any,
  groupId: string,
  key: string,
  fallback: any = null
): Promise<any> {
  try {
    const rawValue = await state.get(groupId, key);

    if (rawValue === null || rawValue === undefined) {
      return fallback;
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
    if (typeof rawValue === 'object') {
      const cloned = safeClone(rawValue);
      return cloned !== null ? cloned : fallback;
    }

    return rawValue;
  } catch (error) {
    console.error('[state-safety] Error getting state:', error);
    return fallback;
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