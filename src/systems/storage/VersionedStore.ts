/**
 * Versioned, validated, corruption-tolerant JSON persistence.
 *
 * Every persisted blob (settings now, save slots in PHASE 2) is wrapped in an envelope:
 *
 *   { format, version, savedAt, checksum, data }
 *
 * Loading never throws. It returns a tagged result so the caller can decide what to
 * show the player ("Your save is from a newer version", "Save data was damaged").
 * Old versions are upgraded through an ordered list of migrations.
 */

import type { SafeStorage, StorageWriteResult } from './SafeStorage';

export const ENVELOPE_FORMAT = 'unclaimed-save';

export interface Envelope<T> {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  savedAt: string;
  checksum: string;
  data: T;
}

export type LoadResult<T> =
  | { status: 'ok'; data: T; migratedFrom?: number }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string }
  | { status: 'future-version'; version: number };

/** Upgrades data from version `from` to `from + 1`. */
export interface Migration {
  from: number;
  migrate: (data: unknown) => unknown;
}

export interface VersionedStoreOptions<T> {
  key: string;
  version: number;
  /** Returns the data if structurally valid, otherwise a reason string. */
  validate: (data: unknown) => { ok: true; value: T } | { ok: false; reason: string };
  migrations?: Migration[];
}

/** FNV-1a 32-bit. Detects truncation and accidental edits; not a security measure. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class VersionedStore<T> {
  private readonly migrations: Migration[];

  constructor(
    private readonly storage: SafeStorage,
    private readonly options: VersionedStoreOptions<T>,
  ) {
    this.migrations = [...(options.migrations ?? [])].sort((a, b) => a.from - b.from);
  }

  load(): LoadResult<T> {
    const raw = this.storage.read(this.options.key);
    if (raw === null || raw === '') return { status: 'empty' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'corrupt', reason: 'not valid JSON' };
    }

    if (!isRecord(parsed) || parsed.format !== ENVELOPE_FORMAT) {
      return { status: 'corrupt', reason: 'unrecognised envelope' };
    }
    const { version, checksum: storedSum, data } = parsed;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return { status: 'corrupt', reason: 'invalid version' };
    }
    if (typeof storedSum !== 'string' || storedSum !== checksum(JSON.stringify(data ?? null))) {
      return { status: 'corrupt', reason: 'checksum mismatch' };
    }
    if (version > this.options.version) {
      return { status: 'future-version', version };
    }

    let current: unknown = data;
    for (let v = version; v < this.options.version; v++) {
      const step = this.migrations.find((m) => m.from === v);
      if (!step) return { status: 'corrupt', reason: `no migration from v${v}` };
      try {
        current = step.migrate(current);
      } catch (error) {
        return { status: 'corrupt', reason: `migration from v${v} failed: ${String(error)}` };
      }
    }

    const checked = this.options.validate(current);
    if (!checked.ok) return { status: 'corrupt', reason: checked.reason };

    return version < this.options.version
      ? { status: 'ok', data: checked.value, migratedFrom: version }
      : { status: 'ok', data: checked.value };
  }

  save(data: T, now: Date = new Date()): StorageWriteResult {
    const envelope: Envelope<T> = {
      format: ENVELOPE_FORMAT,
      version: this.options.version,
      savedAt: now.toISOString(),
      checksum: checksum(JSON.stringify(data ?? null)),
      data,
    };
    return this.storage.write(this.options.key, JSON.stringify(envelope));
  }

  /** Keeps a copy of unreadable data so a bug fix could still recover it later. */
  quarantine(): void {
    const raw = this.storage.read(this.options.key);
    if (raw === null) return;
    this.storage.write(`${this.options.key}.corrupt`, raw);
    this.storage.remove(this.options.key);
  }

  clear(): void {
    this.storage.remove(this.options.key);
  }
}
