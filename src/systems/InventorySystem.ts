/**
 * Inventory rules over GameState.inventory / equipment. Pure logic: UI and battle call
 * these and present the returned text.
 */

import { INVENTORY_SIZE, type GameState } from '@/game/GameState';
import type { ItemDef, ItemKind } from './content/types';
import { format, t } from './LocaleSystem';

export type ItemLookup = (id: string) => ItemDef | undefined;

export interface UseResult {
  ok: boolean;
  consumed: boolean;
  healed: number;
  equipped?: { slot: 'weapon' | 'armor'; previous: string | null };
  text: string[];
}

const KIND_ORDER: Record<ItemKind, number> = { consumable: 0, weapon: 1, armor: 2, key: 3 };

export class InventorySystem {
  constructor(
    private readonly state: GameState,
    private readonly lookup: ItemLookup,
  ) {}

  get items(): ItemDef[] {
    return this.state.inventory.map((id) => this.lookup(id)).filter((i): i is ItemDef => i !== undefined);
  }

  get isFull(): boolean {
    return this.state.inventory.length >= INVENTORY_SIZE;
  }

  get attack(): number {
    return this.state.attack + (this.equippedDef('weapon')?.attack ?? 0);
  }

  get defense(): number {
    return this.state.defense + (this.equippedDef('armor')?.defense ?? 0);
  }

  equippedDef(slot: 'weapon' | 'armor'): ItemDef | undefined {
    const id = this.state.equipment[slot];
    return id ? this.lookup(id) : undefined;
  }

  add(id: string): boolean {
    if (this.isFull || !this.lookup(id)) return false;
    this.state.inventory.push(id);
    return true;
  }

  /** Removes the first copy of `id`. */
  remove(id: string): boolean {
    const index = this.state.inventory.indexOf(id);
    if (index < 0) return false;
    this.state.inventory.splice(index, 1);
    return true;
  }

  use(index: number): UseResult {
    const id = this.state.inventory[index];
    const item = id ? this.lookup(id) : undefined;
    if (!id || !item) return { ok: false, consumed: false, healed: 0, text: [] };
    const fill = (lines: string[] | undefined, vars: Record<string, string | number>): string[] =>
      (lines ?? []).map((line) => format(line, vars));

    switch (item.kind) {
      case 'consumable': {
        const before = this.state.hp;
        this.state.hp = Math.min(this.state.maxHp, this.state.hp + (item.heal ?? 0));
        const healed = this.state.hp - before;
        this.state.inventory.splice(index, 1);
        const full = this.state.hp >= this.state.maxHp;
        const text = fill(item.useText, { heal: healed, name: item.name });
        text.push(full ? t('item.hpFull') : t('item.healed', { n: healed }));
        return { ok: true, consumed: true, healed, text };
      }
      case 'weapon':
      case 'armor': {
        const slot = item.kind;
        const previous = this.state.equipment[slot];
        this.state.equipment[slot] = id;
        this.state.inventory.splice(index, 1);
        if (previous) this.state.inventory.splice(index, 0, previous);
        const text = fill(item.useText, { name: item.name });
        if (text.length === 0) text.push(t('item.equipped', { item: item.name }));
        return { ok: true, consumed: false, healed: 0, equipped: { slot, previous }, text };
      }
      case 'key':
      default:
        return { ok: true, consumed: false, healed: 0, text: fill(item.useText, { name: item.name }) };
    }
  }

  drop(index: number): { ok: boolean; text: string[] } {
    const id = this.state.inventory[index];
    const item = id ? this.lookup(id) : undefined;
    if (!id || !item) return { ok: false, text: [] };
    if (!item.droppable) return { ok: false, text: [t('item.cantDrop', { item: item.name })] };
    this.state.inventory.splice(index, 1);
    return { ok: true, text: [t('item.dropped', { item: item.name })] };
  }

  /** Consumables first, then weapons, armor, key items; alphabetical within a kind. */
  sort(): void {
    const order = (id: string): [number, string] => {
      const item = this.lookup(id);
      return [item ? KIND_ORDER[item.kind] : 99, item?.name ?? id];
    };
    this.state.inventory.sort((a, b) => {
      const [ka, na] = order(a);
      const [kb, nb] = order(b);
      return ka !== kb ? ka - kb : na.localeCompare(nb, 'ko');
    });
  }
}
