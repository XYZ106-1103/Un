import { describe, expect, it } from 'vitest';
import { createNewGameState } from '@/game/GameState';
import type { ItemDef } from '@/systems/content/types';
import { InventorySystem } from '@/systems/InventorySystem';
import { setLocale } from '@/systems/LocaleSystem';

const ITEMS: Record<string, ItemDef> = {
  candy: { id: 'candy', name: '보풀 사탕', description: 'd', kind: 'consumable', heal: 10, droppable: true, useText: ['{name|을/를} 먹었다.'] },
  pin: { id: 'pin', name: '옷핀', description: 'd', kind: 'weapon', attack: 3, droppable: true },
  pin2: { id: 'pin2', name: '안전핀', description: 'd', kind: 'weapon', attack: 5, droppable: true },
  coat: { id: 'coat', name: '비옷', description: 'd', kind: 'armor', defense: 2, droppable: true },
  mitten: { id: 'mitten', name: '왼쪽 장갑', description: 'd', kind: 'key', droppable: false },
};

const setup = (items: string[]) => {
  setLocale('ko');
  const state = createNewGameState({ name: 'A', map: 'm', x: 0, y: 0, facing: 'down', items });
  return { state, inv: new InventorySystem(state, (id) => ITEMS[id]) };
};

describe('InventorySystem', () => {
  it('heals, consumes and formats Korean particles', () => {
    const { state, inv } = setup(['candy']);
    state.hp = 5;
    const r = inv.use(0);
    expect(r).toMatchObject({ ok: true, consumed: true, healed: 10 });
    expect(r.text[0]).toBe('보풀 사탕을 먹었다.');
    expect(state.hp).toBe(15);
    expect(state.inventory).toEqual([]);
  });

  it('caps healing at max HP', () => {
    const { state, inv } = setup(['candy']);
    state.hp = 18;
    expect(inv.use(0).healed).toBe(2);
  });

  it('equips and swaps weapons in place, updating attack', () => {
    const { state, inv } = setup(['pin', 'candy', 'pin2']);
    inv.use(0);
    expect(state.equipment.weapon).toBe('pin');
    expect(inv.attack).toBe(13);
    inv.use(1); // pin2 is now at index 1
    expect(state.equipment.weapon).toBe('pin2');
    expect(state.inventory).toEqual(['candy', 'pin']);
    expect(inv.attack).toBe(15);
  });

  it('respects capacity, undroppable key items and sorting', () => {
    const { state, inv } = setup(['mitten', 'coat', 'candy', 'pin']);
    expect(inv.drop(0).ok).toBe(false);
    inv.sort();
    expect(state.inventory).toEqual(['candy', 'pin', 'coat', 'mitten']);
    for (let i = 0; i < 4; i++) expect(inv.add('candy')).toBe(true);
    expect(inv.isFull).toBe(true);
    expect(inv.add('candy')).toBe(false);
    expect(inv.add('unknown-item')).toBe(false);
  });
});
