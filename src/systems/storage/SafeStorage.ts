/**
 * localStorage wrapper that never throws.
 *
 * localStorage can be missing (some embedded webviews), blocked (privacy modes,
 * sandboxed iframes) or full (QuotaExceededError). The game must keep running in all
 * of those cases, so failures fall back to an in-memory map and are reported, not thrown.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageWriteResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' | 'error' };

class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function detectLocalStorage(): KeyValueStore | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    const probe = '__unclaimed_probe__';
    globalThis.localStorage.setItem(probe, probe);
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export class SafeStorage {
  private readonly backend: KeyValueStore;
  private readonly fallback = new MemoryStore();
  readonly persistent: boolean;

  /**
   * @param prefix Namespaces every key so the game never collides with other apps on the
   *   same origin (common on itch.io-style hosts).
   * @param backend Injected for tests; defaults to localStorage when it is usable.
   */
  constructor(
    private readonly prefix: string,
    backend?: KeyValueStore | null,
  ) {
    const resolved = backend === undefined ? detectLocalStorage() : backend;
    this.backend = resolved ?? this.fallback;
    this.persistent = resolved !== null;
  }

  read(key: string): string | null {
    try {
      return this.backend.getItem(this.prefix + key);
    } catch {
      return this.fallback.getItem(this.prefix + key);
    }
  }

  write(key: string, value: string): StorageWriteResult {
    try {
      this.backend.setItem(this.prefix + key, value);
      return this.persistent ? { ok: true } : { ok: false, reason: 'unavailable' };
    } catch (error) {
      this.fallback.setItem(this.prefix + key, value);
      const quota =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      return { ok: false, reason: quota ? 'quota' : 'error' };
    }
  }

  remove(key: string): void {
    try {
      this.backend.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
    this.fallback.removeItem(this.prefix + key);
  }
}
