/**
 * State Lock Manager
 *
 * Provides atomic operations to prevent race conditions in Motia state updates.
 * Uses fine-grained locks per (groupId, key) pair.
 */

/**
 * Simple Mutex implementation for JavaScript.
 */
export class Mutex {
  private _locked = false;
  private _queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    while (this._locked) {
      await new Promise<void>((resolve) => this._queue.push(resolve));
    }
    this._locked = true;
  }

  release(): void {
    if (!this._locked) {
      console.warn('[Mutex] Release called on unlocked mutex');
      return;
    }
    this._locked = false;
    const resolve = this._queue.shift();
    if (resolve) {
      setImmediate(resolve);
    }
  }

  isLocked(): boolean {
    return this._locked;
  }

  getQueueLength(): number {
    return this._queue.length;
  }
}

/**
 * Manages locks for Motia state operations.
 */
export class StateLockManager {
  private _locks = new Map<string, Mutex>();
  private _stats = {
    totalAcquisitions: 0,
    totalWaiters: 0,
    maxQueueLength: 0,
  };

  private _getLock(key: string): Mutex {
    let lock = this._locks.get(key);
    if (!lock) {
      lock = new Mutex();
      this._locks.set(key, lock);
    }
    return lock;
  }

  async atomicUpdate<T>(
    state: any,
    groupId: string,
    key: string,
    updater: (current: T | null) => T | Promise<T>
  ): Promise<T> {
    const lockKey = `${groupId}:${key}`;
    const lock = this._getLock(lockKey);

    this._stats.totalAcquisitions++;
    this._stats.totalWaiters += lock.getQueueLength();
    if (lock.getQueueLength() > this._stats.maxQueueLength) {
      this._stats.maxQueueLength = lock.getQueueLength();
    }

    await lock.acquire();

    try {
      const current = await state.get(groupId, key);
      const newValue = await updater(current);
      await state.set(groupId, key, newValue);
      return newValue;
    } finally {
      lock.release();
    }
  }

  getStats(): any {
    return {
      totalAcquisitions: this._stats.totalAcquisitions,
      totalWaiters: this._stats.totalWaiters,
      maxQueueLength: this._stats.maxQueueLength,
      activeLocks: this._locks.size,
    };
  }

  getDiagnostics(): any {
    const locks = Array.from(this._locks.entries()).map(([key, mutex]) => ({
      key,
      locked: mutex.isLocked(),
      queueLength: mutex.getQueueLength(),
    }));

    return {
      locks,
      stats: this.getStats(),
    };
  }

  cleanupUnusedLocks(): number {
    let removed = 0;
    for (const [key, mutex] of this._locks.entries()) {
      if (!mutex.isLocked() && mutex.getQueueLength() === 0) {
        this._locks.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clearAllLocks(): void {
    this._locks.clear();
    this._stats = {
      totalAcquisitions: 0,
      totalWaiters: 0,
      maxQueueLength: 0,
    };
  }
}

export const stateLockManager = new StateLockManager();

export function safePushToArray<T>(arr: T[] | null, item: T, maxSize?: number): T[] {
  const current = arr || [];
  const newArray = [item, ...current];

  if (maxSize && newArray.length > maxSize) {
    newArray.splice(maxSize);
  }

  return newArray;
}

export function safeMergeObject(
  base: Record<string, any> | null,
  updates: Record<string, any>
): any {
  const result: Record<string, any> = {};
  if (base) {
    Object.assign(result, base);
  }
  Object.assign(result, updates);
  return result;
}
