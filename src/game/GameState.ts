/**
 * Everything that is saved: the single source of truth for a playthrough.
 * Pure data + helpers (no Phaser), so saves can be validated and tested in Node.
 */

import type { Facing, FlagValue } from '@/systems/content/types';
import type { ConditionValue, Resolver } from '@/systems/script/Condition';

export const GAME_STATE_VERSION = 1;
export const INVENTORY_SIZE = 8;
export const NAME_MAX_LENGTH = 8;

export interface EncounterRecord {
  met: number;
  spared: number;
  cleared: number;
}

export interface GameState {
  name: string;
  hp: number;
  maxHp: number;
  /** Base stats; equipment adds on top (see InventorySystem). */
  attack: number;
  defense: number;
  /** Currency: lost buttons. */
  buttons: number;
  location: { map: string; x: number; y: number; facing: Facing };
  inventory: string[];
  equipment: { weapon: string | null; armor: string | null };
  flags: Record<string, FlagValue>;
  relations: Record<string, number>;
  encounters: Record<string, EncounterRecord>;
  stats: {
    playTimeMs: number;
    steps: number;
    battles: number;
    spared: number;
    cleared: number;
    saves: number;
  };
  lastSavePoint: string | null;
}

export interface NewGameOptions {
  name: string;
  map: string;
  x: number;
  y: number;
  facing: Facing;
  items: string[];
}

export function createNewGameState(options: NewGameOptions): GameState {
  return {
    name: options.name,
    hp: 20,
    maxHp: 20,
    attack: 10,
    defense: 0,
    buttons: 0,
    location: { map: options.map, x: options.x, y: options.y, facing: options.facing },
    inventory: options.items.slice(0, INVENTORY_SIZE),
    equipment: { weapon: null, armor: null },
    flags: {},
    relations: {},
    encounters: {},
    stats: { playTimeMs: 0, steps: 0, battles: 0, spared: 0, cleared: 0, saves: 0 },
    lastSavePoint: null,
  };
}

/** Trims, collapses whitespace and caps length (by code point, so Hangul counts as one). */
export function normalizeName(raw: string): string {
  return [...raw.replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX_LENGTH).join('');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFacing = (v: unknown): v is Facing => v === 'down' || v === 'up' || v === 'left' || v === 'right';
const isFlag = (v: unknown): v is FlagValue => typeof v === 'boolean' || typeof v === 'string' || isNum(v);

export function validateGameState(data: unknown): { ok: true; value: GameState } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(data)) return fail('state is not an object');
  const d = data;
  if (typeof d.name !== 'string' || d.name.length === 0) return fail('name');
  for (const key of ['hp', 'maxHp', 'attack', 'defense', 'buttons'] as const) {
    if (!isNum(d[key])) return fail(key);
  }
  if ((d.maxHp as number) <= 0 || (d.hp as number) < 0) return fail('hp range');
  const loc = d.location;
  if (!isObj(loc) || typeof loc.map !== 'string' || !isNum(loc.x) || !isNum(loc.y) || !isFacing(loc.facing)) {
    return fail('location');
  }
  if (!Array.isArray(d.inventory) || !d.inventory.every((i) => typeof i === 'string') || d.inventory.length > INVENTORY_SIZE) {
    return fail('inventory');
  }
  const eq = d.equipment;
  if (!isObj(eq) || !(eq.weapon === null || typeof eq.weapon === 'string') || !(eq.armor === null || typeof eq.armor === 'string')) {
    return fail('equipment');
  }
  if (!isObj(d.flags) || !Object.values(d.flags).every(isFlag)) return fail('flags');
  if (!isObj(d.relations) || !Object.values(d.relations).every(isNum)) return fail('relations');
  if (
    !isObj(d.encounters) ||
    !Object.values(d.encounters).every((e) => isObj(e) && isNum(e.met) && isNum(e.spared) && isNum(e.cleared))
  ) {
    return fail('encounters');
  }
  const st = d.stats;
  if (!isObj(st) || !['playTimeMs', 'steps', 'battles', 'spared', 'cleared', 'saves'].every((k) => isNum(st[k]))) {
    return fail('stats');
  }
  if (!(d.lastSavePoint === null || typeof d.lastSavePoint === 'string')) return fail('lastSavePoint');
  return { ok: true, value: data as unknown as GameState };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/** Applies a `set` block: plain values assign, "+N"/"-N" strings add to numeric flags. */
export function applyFlagChanges(flags: Record<string, FlagValue>, changes: Record<string, FlagValue>): void {
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === 'string' && /^[+-]\d+(\.\d+)?$/.test(value)) {
      const current = flags[key];
      flags[key] = (typeof current === 'number' ? current : 0) + Number(value);
    } else {
      flags[key] = value;
    }
  }
}

export function encounterRecord(state: GameState, enemyId: string): EncounterRecord {
  let record = state.encounters[enemyId];
  if (!record) {
    record = { met: 0, spared: 0, cleared: 0 };
    state.encounters[enemyId] = record;
  }
  return record;
}

/**
 * Resolves condition keys against a game state:
 *   flag:<id>  item:<id>  rel:<id>  met:<enemy>  spared:<enemy>  cleared:<enemy>
 *   stat:<name>  hp  maxHp  buttons  name
 * Unknown keys are passed to `extra` (battle variables, script locals).
 */
export function stateResolver(state: GameState, extra?: Resolver): Resolver {
  return (key: string): ConditionValue => {
    const sep = key.indexOf(':');
    const ns = sep >= 0 ? key.slice(0, sep) : key;
    const id = sep >= 0 ? key.slice(sep + 1) : '';
    switch (ns) {
      case 'flag':
        return state.flags[id];
      case 'item':
        return state.inventory.includes(id) || state.equipment.weapon === id || state.equipment.armor === id;
      case 'rel':
        return state.relations[id] ?? 0;
      case 'met':
        return state.encounters[id]?.met ?? 0;
      case 'spared':
        return state.encounters[id]?.spared ?? 0;
      case 'cleared':
        return state.encounters[id]?.cleared ?? 0;
      case 'stat':
        return (state.stats as unknown as Record<string, number>)[id];
      case 'hp':
        return state.hp;
      case 'maxHp':
        return state.maxHp;
      case 'buttons':
        return state.buttons;
      case 'name':
        return state.name;
      default:
        return extra ? extra(key) : undefined;
    }
  };
}
