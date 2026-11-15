/**
 * Save slots.
 *
 * Each of the three slots stores:
 *   save.<n>       manual save (written at save points)
 *   save.<n>.bak   the previous manual save (recovery if the main copy is damaged)
 *   save.<n>.auto  autosave (written on map transitions)
 * Loading a slot returns whichever valid snapshot is newest. Nothing here throws:
 * damaged data is reported, quarantined and, when possible, recovered from the backup.
 */

import { GAME_STATE_VERSION, validateGameState, type GameState } from '@/game/GameState';
import type { SafeStorage, StorageWriteResult } from './storage/SafeStorage';
import { VersionedStore, type LoadResult } from './storage/VersionedStore';

export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export type SaveKind = 'manual' | 'auto';

export type SlotLoad =
  | { status: 'ok'; state: GameState; kind: SaveKind; savedAt: string; recovered: boolean }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string }
  | { status: 'future-version'; version: number };

export type SlotSummary =
  | {
      slot: SlotId;
      status: 'ok';
      name: string;
      map: string;
      playTimeMs: number;
      savedAt: string;
      kind: SaveKind;
      recovered: boolean;
    }
  | { slot: SlotId; status: 'empty' | 'corrupt' | 'future-version' };

export class SaveSystem {
  private readonly manual = new Map<SlotId, VersionedStore<GameState>>();
  private readonly backup = new Map<SlotId, VersionedStore<GameState>>();
  private readonly auto = new Map<SlotId, VersionedStore<GameState>>();

  constructor(private readonly storage: SafeStorage) {
    const make = (key: string) =>
      new VersionedStore<GameState>(storage, { key, version: GAME_STATE_VERSION, validate: validateGameState });
    for (const slot of SLOT_IDS) {
      this.manual.set(slot, make(`save.${slot}`));
      this.backup.set(slot, make(`save.${slot}.bak`));
      this.auto.set(slot, make(`save.${slot}.auto`));
    }
  }

  save(slot: SlotId, state: GameState, kind: SaveKind = 'manual'): StorageWriteResult {
    if (kind === 'manual') {
      const main = this.store(this.manual, slot);
      const previous = main.raw();
      if (previous !== null) {
        // Keep the last good save as a backup; keep damaged data aside for recovery tools.
        if (main.load().status === 'ok') this.store(this.backup, slot).writeRaw(previous);
        else main.quarantine();
      }
      const result = main.save(state);
      // A fresh manual save supersedes any older autosave.
      this.store(this.auto, slot).clear();
      this.setLastSlot(slot);
      return result;
    }
    const result = this.store(this.auto, slot).save(state);
    this.setLastSlot(slot);
    return result;
  }

  /**
   * Loads a slot. By default the newest valid snapshot wins (manual or auto). With
   * `prefer: 'manual'` the last stamp-desk record is used when one exists - that is what
   * "retry from the last record" means after a game over.
   */
  load(slot: SlotId, options: { prefer?: 'newest' | 'manual' } = {}): SlotLoad {
    const main = this.store(this.manual, slot).load();
    const auto = this.store(this.auto, slot).load();
    let manualResult: LoadResult<GameState> = main;
    let recovered = false;

    // Loading is read-only: damaged data stays in place (so the slot keeps reporting it)
    // until the player saves over it, at which point it is quarantined.
    if (main.status === 'corrupt') {
      console.warn(`[SaveSystem] slot ${slot} manual save damaged (${main.reason})`);
      const bak = this.store(this.backup, slot).load();
      if (bak.status === 'ok') {
        manualResult = bak;
        recovered = true;
      }
    }

    const candidates: { state: GameState; savedAt: string; kind: SaveKind; recovered: boolean }[] = [];
    if (manualResult.status === 'ok') {
      candidates.push({ state: manualResult.data, savedAt: manualResult.savedAt, kind: 'manual', recovered });
    }
    if (auto.status === 'ok') candidates.push({ state: auto.data, savedAt: auto.savedAt, kind: 'auto', recovered: false });
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      if (options.prefer === 'manual') {
        const manual = candidates.find((c) => c.kind === 'manual');
        if (manual) return { status: 'ok', ...manual };
      }
      const best = candidates[0] as (typeof candidates)[number];
      return { status: 'ok', ...best };
    }

    if (main.status === 'future-version') return main;
    if (auto.status === 'future-version') return auto;
    if (main.status === 'corrupt') return { status: 'corrupt', reason: main.reason };
    if (auto.status === 'corrupt') return { status: 'corrupt', reason: auto.reason };
    return { status: 'empty' };
  }

  summary(slot: SlotId): SlotSummary {
    const result = this.load(slot);
    if (result.status !== 'ok') return { slot, status: result.status };
    return {
      slot,
      status: 'ok',
      name: result.state.name,
      map: result.state.location.map,
      playTimeMs: result.state.stats.playTimeMs,
      savedAt: result.savedAt,
      kind: result.kind,
      recovered: result.recovered,
    };
  }

  summaries(): SlotSummary[] {
    return SLOT_IDS.map((slot) => this.summary(slot));
  }

  hasAnySave(): boolean {
    return SLOT_IDS.some((slot) => this.summary(slot).status === 'ok');
  }

  /** Most recently written slot that still holds a loadable save. */
  lastUsedSlot(): SlotId | null {
    const raw = Number(this.storage.read('save.last'));
    const slot = SLOT_IDS.find((s) => s === raw);
    return slot !== undefined && this.summary(slot).status === 'ok' ? slot : null;
  }

  delete(slot: SlotId): void {
    this.store(this.manual, slot).clear();
    this.store(this.backup, slot).clear();
    this.store(this.auto, slot).clear();
  }

  private setLastSlot(slot: SlotId): void {
    this.storage.write('save.last', String(slot));
  }

  private store(map: Map<SlotId, VersionedStore<GameState>>, slot: SlotId): VersionedStore<GameState> {
    const store = map.get(slot);
    if (!store) throw new Error(`SaveSystem: unknown slot ${slot}`);
    return store;
  }
}

export function formatPlayTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
