/**
 * The playthrough in progress: game state + the slot it saves to.
 * Created by the menu (new game / continue), read by World and Battle.
 */

import { content } from '@/systems/content/ContentDB';
import type { FlagValue } from '@/systems/content/types';
import { InventorySystem } from '@/systems/InventorySystem';
import type { SaveKind, SaveSystem, SlotId } from '@/systems/SaveSystem';
import type { Resolver } from '@/systems/script/Condition';
import type { StorageWriteResult } from '@/systems/storage/SafeStorage';
import { applyFlagChanges, stateResolver, type GameState } from './GameState';

export class GameSession {
  readonly inventory: InventorySystem;

  constructor(
    readonly state: GameState,
    readonly slot: SlotId,
    private readonly saves: SaveSystem,
  ) {
    // Saves from older builds may reference items that no longer exist.
    state.inventory = state.inventory.filter((id) => content.item(id) !== undefined);
    this.inventory = new InventorySystem(state, (id) => content.item(id));
  }

  resolver(extra?: Resolver): Resolver {
    return stateResolver(this.state, extra);
  }

  flag(key: string): FlagValue | undefined {
    return this.state.flags[key];
  }

  setFlags(changes: Record<string, FlagValue>): void {
    applyFlagChanges(this.state.flags, changes);
  }

  addRelation(id: string, amount: number): void {
    this.state.relations[id] = (this.state.relations[id] ?? 0) + amount;
  }

  addPlayTime(ms: number): void {
    // Clamp: a backgrounded tab can report one huge frame.
    this.state.stats.playTimeMs += Math.min(ms, 1000);
  }

  save(kind: SaveKind): StorageWriteResult {
    if (kind === 'manual') this.state.stats.saves += 1;
    return this.saves.save(this.slot, this.state, kind);
  }
}
