/**
 * Memory that outlives save files. Ledger writes in ink: some things are remembered
 * even when the player reloads a save to undo them.
 *
 *  - lastClear: the most recent enemy the player cleared, with a timestamp. If a save
 *    older than that is loaded, the player "undid" it — Ledger notices (once per clear).
 *  - endings: every chapter ending reached, newest last (changes the title screen).
 *
 * Kept deliberately small and used sparingly (see docs/GAME_DESIGN.md §9).
 */

import type { SafeStorage } from './storage/SafeStorage';
import { VersionedStore } from './storage/VersionedStore';

export interface MetaData {
  endings: string[];
  lastClear: { enemy: string; at: string } | null;
  undoNotices: number;
  starts: number;
}

const DEFAULT_META: MetaData = { endings: [], lastClear: null, undoNotices: 0, starts: 0 };

function sanitize(input: unknown): MetaData {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const lc = src.lastClear as Record<string, unknown> | null | undefined;
  return {
    endings: Array.isArray(src.endings) ? src.endings.filter((e): e is string => typeof e === 'string') : [],
    lastClear: lc && typeof lc.enemy === 'string' && typeof lc.at === 'string' ? { enemy: lc.enemy, at: lc.at } : null,
    undoNotices: typeof src.undoNotices === 'number' && Number.isFinite(src.undoNotices) ? src.undoNotices : 0,
    starts: typeof src.starts === 'number' && Number.isFinite(src.starts) ? src.starts : 0,
  };
}

export class MetaSystem {
  private readonly store: VersionedStore<MetaData>;
  private current: MetaData;

  constructor(storage: SafeStorage) {
    this.store = new VersionedStore<MetaData>(storage, {
      key: 'meta',
      version: 1,
      validate: (data) => ({ ok: true, value: sanitize(data) }),
    });
    const loaded = this.store.load();
    this.current = loaded.status === 'ok' ? loaded.data : { ...DEFAULT_META, endings: [] };
  }

  get data(): Readonly<MetaData> {
    return this.current;
  }

  get lastEnding(): string | null {
    return this.current.endings[this.current.endings.length - 1] ?? null;
  }

  recordStart(): void {
    this.current.starts += 1;
    this.persist();
  }

  recordClear(enemy: string, now: Date = new Date()): void {
    this.current.lastClear = { enemy, at: now.toISOString() };
    this.persist();
  }

  recordEnding(id: string): void {
    this.current.endings.push(id);
    this.persist();
  }

  /**
   * Called when a save is loaded. If something was cleared after that save was written,
   * returns the enemy id (once) so the story can react to the "undo".
   */
  detectUndo(savedAt: string): string | null {
    const lc = this.current.lastClear;
    if (!lc || lc.at <= savedAt) return null;
    this.current.lastClear = null;
    this.current.undoNotices += 1;
    this.persist();
    return lc.enemy;
  }

  private persist(): void {
    this.store.save(this.current);
  }
}
